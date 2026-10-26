import { mkdir, readFile, rename, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Article, BiggerPicture, Bookmark, Edition, EditionSummary, FeedbackEvent, IngestionRun, ReaderPreferences, SourceHealth } from "../types";
import { hydratePreferences } from "../preferences";
import type { TopicId } from "../topics";
import type { Delivery, WorkflowRun } from "../workflow/types";
import { RunBusyError, type ArticleQuery, type CachedSummary, type FeedbackDeleteFilter, type Store } from "./types";

/**
 * Demo-mode store: a single JSON file on the server's disk.
 *
 * Locally this survives restarts (default `.data/daybreak.json`). On Vercel it lives in the
 * function instance's /tmp and is NOT durable or shared between instances — the UI labels demo
 * mode accordingly. Configure Supabase for real persistence.
 */
interface FileData {
  version: 1;
  articles: Record<string, Article>;
  summaries: Record<string, CachedSummary>;
  sources: Record<string, SourceHealth>;
  runs: IngestionRun[];
  preferences: Record<string, ReaderPreferences>;
  editions: Record<string, Edition>;
  feedback: FeedbackEvent[];
  bookmarks: Bookmark[];
  affinities: Record<string, Partial<Record<TopicId, { weight: number; events: number }>>>;
  workflowRuns: Record<string, WorkflowRun>;
  deliveries: Record<string, Delivery>;
}

const EMPTY: FileData = {
  version: 1,
  articles: {},
  summaries: {},
  sources: {},
  runs: [],
  preferences: {},
  editions: {},
  feedback: [],
  bookmarks: [],
  affinities: {},
  workflowRuns: {},
  deliveries: {},
};

const ARTICLE_RETENTION_DAYS = 21;
const MAX_ARTICLES = 6000;
const MAX_FEEDBACK_PER_USER = 2000;
const MAX_RUNS_PER_USER = 200;

export class FileStore implements Store {
  readonly kind = "file" as const;
  private data: FileData | null = null;
  private mtimeMs = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  static inDir(dir: string): FileStore {
    return new FileStore(path.resolve(dir, "daybreak.json"));
  }

  private async load(): Promise<FileData> {
    try {
      const s = await stat(this.file);
      if (this.data && s.mtimeMs === this.mtimeMs) return this.data;
      const raw = await readFile(this.file, "utf8");
      this.data = { ...structuredClone(EMPTY), ...(JSON.parse(raw) as FileData) };
      this.mtimeMs = s.mtimeMs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      this.data ??= structuredClone(EMPTY);
    }
    return this.data;
  }

  private async persist(data: FileData): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, this.file);
    this.mtimeMs = (await stat(this.file)).mtimeMs;
    this.data = data;
  }

  /** Serialise read-modify-write cycles within this process. */
  private mutate<T>(fn: (data: FileData) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const data = await this.load();
      const result = await fn(data);
      await this.persist(data);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read<T>(fn: (data: FileData) => T): Promise<T> {
    await this.queue;
    return fn(await this.load());
  }

  // ---- shared news data ----------------------------------------------------

  upsertArticles(articles: Article[]): Promise<number> {
    return this.mutate((data) => {
      let inserted = 0;
      for (const a of articles) {
        const existing = data.articles[a.id];
        if (!existing) inserted++;
        // Keep the original collection time so freshness reflects first sight.
        data.articles[a.id] = existing ? { ...a, collectedAt: existing.collectedAt } : a;
      }
      const cutoff = Date.now() - ARTICLE_RETENTION_DAYS * 86400_000;
      const all = Object.values(data.articles).filter((a) => Date.parse(a.publishedAt ?? a.collectedAt) >= cutoff);
      all.sort((a, b) => Date.parse(b.publishedAt ?? b.collectedAt) - Date.parse(a.publishedAt ?? a.collectedAt));
      data.articles = Object.fromEntries(all.slice(0, MAX_ARTICLES).map((a) => [a.id, a]));
      return inserted;
    });
  }

  listArticles(query: ArticleQuery): Promise<Article[]> {
    return this.read((data) => {
      const since = query.sinceHours ? Date.now() - query.sinceHours * 3600_000 : 0;
      const text = query.text?.toLowerCase().trim();
      let list = Object.values(data.articles).filter((a) => Date.parse(a.publishedAt ?? a.collectedAt) >= since);
      if (query.topic) list = list.filter((a) => a.topics.includes(query.topic!));
      if (query.sourceIds) list = list.filter((a) => query.sourceIds!.includes(a.sourceId));
      if (query.publisher) list = list.filter((a) => a.publisher === query.publisher);
      if (text) {
        // Every word must appear in the headline, summary or publisher (case-insensitive).
        const words = text.split(/\s+/).filter(Boolean);
        list = list.filter((a) => {
          const hay = `${a.title} ${a.description} ${a.publisher}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        });
      }
      const dir = query.sort === "oldest" ? -1 : 1;
      list.sort((a, b) => dir * (Date.parse(b.publishedAt ?? b.collectedAt) - Date.parse(a.publishedAt ?? a.collectedAt)));
      return list.slice(0, query.limit ?? 500);
    });
  }

  getArticles(ids: string[]): Promise<Article[]> {
    return this.read((data) => ids.map((id) => data.articles[id]).filter((a): a is Article => Boolean(a)));
  }

  getSourceHealth(): Promise<SourceHealth[]> {
    return this.read((data) => Object.values(data.sources));
  }

  saveSourceHealth(health: SourceHealth[]): Promise<void> {
    return this.mutate((data) => {
      for (const h of health) data.sources[h.sourceId] = h;
    });
  }

  recordIngestionRun(run: IngestionRun): Promise<void> {
    return this.mutate((data) => {
      data.runs = [run, ...data.runs].slice(0, 50);
    });
  }

  // Single process in file mode, so an in-memory lease is enough.
  private lease: { holder: string; until: number } | null = null;
  async claimIngestLock(holder: string, seconds: number): Promise<boolean> {
    if (this.lease && this.lease.until > Date.now()) return false;
    this.lease = { holder, until: Date.now() + seconds * 1000 };
    return true;
  }
  async releaseIngestLock(holder: string): Promise<void> {
    if (this.lease?.holder === holder) this.lease = null;
  }

  lastIngestionRun(): Promise<IngestionRun | null> {
    return this.read((data) => data.runs[0] ?? null);
  }

  getCachedSummaries(ids: string[], model: string): Promise<CachedSummary[]> {
    return this.read((data) => ids.map((id) => data.summaries[`${model}:${id}`]).filter((s): s is CachedSummary => Boolean(s)));
  }

  saveCachedSummaries(items: CachedSummary[]): Promise<void> {
    return this.mutate((data) => {
      for (const s of items) data.summaries[`${s.model}:${s.articleId}`] = s;
    });
  }

  // ---- reader data -------------------------------------------------------------

  getPreferences(userId: string): Promise<ReaderPreferences | null> {
    return this.read((data) => hydratePreferences(data.preferences[userId] ?? null));
  }

  savePreferences(userId: string, prefs: ReaderPreferences): Promise<void> {
    return this.mutate((data) => {
      data.preferences[userId] = prefs;
    });
  }

  listEditions(userId: string, limit = 60): Promise<EditionSummary[]> {
    return this.read((data) =>
      Object.values(data.editions)
        .filter((e) => e.userId === userId)
        .sort((a, b) => b.editionDate.localeCompare(a.editionDate) || b.revision - a.revision)
        .slice(0, limit)
        .map(toSummary),
    );
  }

  getEdition(userId: string, editionId: string): Promise<Edition | null> {
    return this.read((data) => {
      const e = data.editions[editionId];
      return e && e.userId === userId ? e : null;
    });
  }

  latestEdition(userId: string, editionDate?: string): Promise<Edition | null> {
    return this.read((data) => {
      const list = Object.values(data.editions)
        .filter((e) => e.userId === userId && (!editionDate || e.editionDate === editionDate))
        .sort((a, b) => b.editionDate.localeCompare(a.editionDate) || b.revision - a.revision);
      return list[0] ?? null;
    });
  }

  async latestEditionId(userId: string): Promise<string | null> {
    return (await this.latestEdition(userId))?.id ?? null;
  }

  insertEdition(edition: Edition): Promise<{ edition: Edition; created: boolean }> {
    return this.mutate((data) => {
      const existing = Object.values(data.editions).find(
        (e) => e.userId === edition.userId && e.editionDate === edition.editionDate && e.revision === edition.revision,
      );
      if (existing) return { edition: existing, created: false };
      data.editions[edition.id] = edition;
      return { edition, created: true };
    });
  }

  saveBiggerPicture(userId: string, editionId: string, position: number, bp: BiggerPicture): Promise<void> {
    return this.mutate((data) => {
      const e = data.editions[editionId];
      if (!e || e.userId !== userId) throw new Error("Edition not found");
      const story = e.stories.find((s) => s.position === position);
      if (!story) throw new Error("Story not found");
      story.biggerPicture = bp;
    });
  }

  recordFeedback(event: FeedbackEvent): Promise<{ deduplicated: boolean }> {
    return this.mutate((data) => {
      const existing = event.articleId
        ? data.feedback.find((f) => f.userId === event.userId && f.articleId === event.articleId && f.type === event.type)
        : undefined;
      if (existing) {
        existing.createdAt = event.createdAt;
        existing.value = event.value;
        return { deduplicated: true };
      }
      data.feedback.push(event);
      const mine = data.feedback.filter((f) => f.userId === event.userId);
      if (mine.length > MAX_FEEDBACK_PER_USER) {
        const drop = new Set(mine.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, mine.length - MAX_FEEDBACK_PER_USER));
        data.feedback = data.feedback.filter((f) => !drop.has(f));
      }
      return { deduplicated: false };
    });
  }

  listFeedback(userId: string, sinceDays: number): Promise<FeedbackEvent[]> {
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    return this.read((data) => data.feedback.filter((f) => f.userId === userId && f.createdAt >= since));
  }

  deleteFeedback(userId: string, filter: FeedbackDeleteFilter): Promise<number> {
    return this.mutate((data) => {
      const before = data.feedback.length;
      data.feedback = data.feedback.filter((f) => f.userId !== userId || !matchesDelete(f, filter));
      return before - data.feedback.length;
    });
  }

  listBookmarks(userId: string): Promise<Bookmark[]> {
    return this.read((data) => data.bookmarks.filter((b) => b.userId === userId).sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
  }

  addBookmark(bookmark: Bookmark): Promise<void> {
    return this.mutate((data) => {
      if (!data.bookmarks.some((b) => b.userId === bookmark.userId && b.articleId === bookmark.articleId)) data.bookmarks.push(bookmark);
    });
  }

  removeBookmark(userId: string, articleId: string): Promise<void> {
    return this.mutate((data) => {
      data.bookmarks = data.bookmarks.filter((b) => !(b.userId === userId && b.articleId === articleId));
    });
  }

  saveAffinities(userId: string, weights: Partial<Record<TopicId, { weight: number; events: number }>>): Promise<void> {
    return this.mutate((data) => {
      data.affinities[userId] = weights;
    });
  }

  createWorkflowRun(run: WorkflowRun): Promise<{ run: WorkflowRun; created: boolean }> {
    return this.mutate((data) => {
      const existing = Object.values(data.workflowRuns).find((r) => r.userId === run.userId && r.idempotencyKey === run.idempotencyKey);
      if (existing) return { run: structuredClone(existing), created: false };
      if (run.status === "running" && Object.values(data.workflowRuns).some((r) => r.userId === run.userId && r.status === "running")) throw new RunBusyError();
      data.workflowRuns[run.id] = structuredClone(run);
      // Retention: keep the newest runs per reader.
      const mine = Object.values(data.workflowRuns).filter((r) => r.userId === run.userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      for (const old of mine.slice(MAX_RUNS_PER_USER)) delete data.workflowRuns[old.id];
      return { run: structuredClone(run), created: true };
    });
  }

  saveWorkflowRun(run: WorkflowRun): Promise<void> {
    return this.mutate((data) => {
      if (run.status === "running" && Object.values(data.workflowRuns).some((r) => r.userId === run.userId && r.status === "running" && r.id !== run.id)) throw new RunBusyError();
      data.workflowRuns[run.id] = structuredClone(run);
    });
  }

  getWorkflowRun(userId: string, runId: string): Promise<WorkflowRun | null> {
    return this.read((data) => {
      const r = data.workflowRuns[runId];
      return r && r.userId === userId ? structuredClone(r) : null;
    });
  }

  findWorkflowRun(userId: string, idempotencyKey: string): Promise<WorkflowRun | null> {
    return this.read((data) => structuredClone(Object.values(data.workflowRuns).find((r) => r.userId === userId && r.idempotencyKey === idempotencyKey) ?? null));
  }

  listWorkflowRuns(userId: string, limit = 30): Promise<WorkflowRun[]> {
    return this.read((data) =>
      Object.values(data.workflowRuns)
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map((r) => structuredClone(r)),
    );
  }

  getDelivery(userId: string, key: string): Promise<Delivery | null> {
    return this.read((data) => {
      const d = data.deliveries[key];
      return d && d.userId === userId ? structuredClone(d) : null;
    });
  }

  saveDelivery(delivery: Delivery): Promise<void> {
    return this.mutate((data) => {
      const existing = data.deliveries[delivery.key];
      if (existing && existing.userId !== delivery.userId) throw new Error("delivery key belongs to another reader");
      data.deliveries[delivery.key] = structuredClone(delivery);
    });
  }

  listDeliveries(userId: string, limit = 30): Promise<Delivery[]> {
    return this.read((data) =>
      Object.values(data.deliveries)
        .filter((d) => d.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map((d) => structuredClone(d)),
    );
  }

  /** Demo mode has no accounts; DEMO_DELIVERY_EMAIL lets the local outbox demonstrate delivery. */
  async getReaderEmail(): Promise<string | null> {
    return process.env.DEMO_DELIVERY_EMAIL?.trim() || null;
  }

  listReadersForPreparation(limit: number): Promise<string[]> {
    return this.read((data) =>
      Object.entries(data.preferences)
        .filter(([, p]) => p.onboardedAt)
        .map(([id]) => id)
        .slice(0, limit),
    );
  }
}

export function matchesDelete(f: FeedbackEvent, filter: FeedbackDeleteFilter): boolean {
  if (filter.all) return true;
  if (filter.articleId) return f.articleId === filter.articleId && (!filter.type || f.type === filter.type);
  if (filter.topic) return f.topics[0] === filter.topic;
  return false;
}

export function toSummary(e: Edition): EditionSummary {
  return {
    id: e.id,
    editionDate: e.editionDate,
    revision: e.revision,
    createdAt: e.createdAt,
    leadTitle: e.stories[0]?.article.title ?? "",
    storyCount: e.stories.length,
    contentMode: e.contentMode,
  };
}
