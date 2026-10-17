import { randomUUID } from "node:crypto";
import type { LanguageModel } from "ai";
import { LIMITS, llmStatusNote, newsMode } from "../env";
import { runEditorial, SUMMARY_CHARS, type EditorialResult } from "../ai/editorial";
import { ingest } from "../news/ingest";
import { sampleArticles } from "../news/sample";
import { editionDateFor } from "../preferences";
import { computeLearnedProfile, topicWeights } from "../rank/learning";
import { planEdition, type PlannedStory } from "../rank/plan";
import { RANKING_VERSION, WEIGHTS } from "../rank/score";
import type { Store } from "../store/types";
import { truncateText } from "../text";
import type { Article, ArticleSnapshot, Edition, EditionStory, ReaderPreferences } from "../types";
import { evidenceBiggerPicture, evidenceThreeThings, findEarlierCoverage, templateIntro } from "./evidence";

export class CooldownError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Please wait ${retryAfterSeconds}s before regenerating`);
    this.name = "CooldownError";
  }
}

export class NoContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoContentError";
  }
}

export interface AiHandle {
  model: LanguageModel;
  provider: string;
  modelId: string;
  timeoutMs: number;
  maxOutputTokens: number;
}

export interface GenerateOptions {
  store: Store;
  userId: string;
  prefs: ReaderPreferences;
  /** "ensure" returns today's latest edition if one exists; "regenerate" creates a new revision. */
  mode: "ensure" | "regenerate";
  ai: AiHandle | null;
  now?: Date;
  /** Refresh feeds first when the pool is stale (default true unless NEWS_MODE=sample). */
  refreshNews?: boolean;
  /** Override article source (tests, evaluation). */
  articles?: Article[];
  log?: (msg: string, data?: Record<string, unknown>) => void;
}

export interface GenerateResult {
  edition: Edition;
  created: boolean;
  aiUsed: boolean;
  ingestion: { ran: boolean; inserted: number; errors: number } | null;
}

/** Number of top stories that get Bigger Picture analysis at generation time. */
export const BIGGER_PICTURE_AT_GENERATION = 3;

const inflight = new Map<string, Promise<GenerateResult>>();

/**
 * Generate (or return) a reader's edition. Concurrent calls for the same reader share one
 * in-flight generation; the database unique key (user, date, revision) is the final guard.
 */
export function generateEdition(opts: GenerateOptions): Promise<GenerateResult> {
  const key = `${opts.store.kind}:${opts.userId}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = doGenerate(opts).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function snapshot(a: Article): ArticleSnapshot {
  return {
    id: a.id,
    url: a.url,
    title: a.title,
    excerpt: a.description,
    publisher: a.publisher,
    sourceId: a.sourceId,
    author: a.author,
    imageUrl: a.imageUrl,
    publishedAt: a.publishedAt,
    topics: a.topics,
    regions: a.regions,
    sample: a.sample,
  };
}

async function loadCandidates(opts: GenerateOptions, now: Date, log: NonNullable<GenerateOptions["log"]>) {
  if (opts.articles) return { articles: opts.articles, contentMode: opts.articles.every((a) => a.sample) ? ("sample" as const) : ("live" as const), ingestion: null };

  if (newsMode() === "sample") {
    const articles = sampleArticles(now);
    // Make the labelled sample set searchable in demo storage only — never in the shared database.
    if (opts.store.kind === "file") await opts.store.upsertArticles(articles).catch(() => undefined);
    return { articles, contentMode: "sample" as const, ingestion: null };
  }

  let ingestion: GenerateResult["ingestion"] = null;
  const last = await opts.store.lastIngestionRun();
  const stale = !last || now.getTime() - Date.parse(last.finishedAt) > LIMITS.poolStaleMinutes * 60_000;
  if ((opts.refreshNews ?? true) && stale) {
    try {
      const run = await ingest({ store: opts.store, trigger: "on_demand", budgetMs: 18_000, log });
      ingestion = { ran: true, inserted: run.inserted, errors: run.results.filter((r) => r.outcome === "error").length };
    } catch (err) {
      log("ingest_failed", { error: (err as Error).message });
      ingestion = { ran: true, inserted: 0, errors: -1 };
    }
  }
  const articles = (await opts.store.listArticles({ sinceHours: LIMITS.candidateHours, limit: 1500 })).filter((a) => !a.sample);
  if (articles.length >= 8) return { articles, contentMode: "live" as const, ingestion };
  // Feeds unreachable and nothing stored: fall back to the labelled sample set rather than an empty paper.
  log("using_sample_fallback", { live: articles.length });
  return { articles: sampleArticles(now), contentMode: "sample" as const, ingestion };
}

async function doGenerate(opts: GenerateOptions): Promise<GenerateResult> {
  const { store, userId, prefs } = opts;
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => undefined);
  const editionDate = editionDateFor(prefs.timezone, now);

  const latestToday = await store.latestEdition(userId, editionDate);
  if (opts.mode === "ensure" && latestToday) return { edition: latestToday, created: false, aiUsed: latestToday.ai.used, ingestion: null };
  if (opts.mode === "regenerate" && latestToday) {
    const age = (now.getTime() - Date.parse(latestToday.createdAt)) / 1000;
    if (age < LIMITS.regenerateCooldownSeconds) throw new CooldownError(Math.ceil(LIMITS.regenerateCooldownSeconds - age));
  }
  const revision = (latestToday?.revision ?? 0) + 1;

  const { articles, contentMode, ingestion } = await loadCandidates(opts, now, log);
  const [feedback, editionList] = await Promise.all([store.listFeedback(userId, 90), store.listEditions(userId, 10)]);
  const learned = computeLearnedProfile(feedback, now);

  // Earlier days' editions: exposure penalties and "what changed" comparisons.
  const earlierSummaries = editionList.filter((e) => e.editionDate !== editionDate).slice(0, 7);
  const history = (await Promise.all(earlierSummaries.map((e) => store.getEdition(userId, e.id)))).filter((e): e is Edition => Boolean(e));
  const seenIds = new Set(history.flatMap((e) => e.stories.map((s) => s.article.id)));
  const seenTitles = history.flatMap((e) => e.stories.map((s) => s.article.title));

  const plan = planEdition({ articles, prefs, learned, now, seenIds, seenTitles });
  if (plan.stories.length === 0) throw new NoContentError("No stories matched your preferences. Try following more sections or unmuting a topic.");

  const snapshots = plan.stories.map((s) => snapshot(s.scored.article));

  // ---- AI editorial pass (optional) -------------------------------------------------
  let editorial: EditorialResult | null = null;
  let aiNote: string | null = opts.ai ? null : llmStatusNote();
  if (opts.ai) {
    try {
      const cached = await store.getCachedSummaries(snapshots.map((s) => s.id), opts.ai.modelId);
      const cachedById = new Map(cached.map((c) => [c.articleId, c.summary]));
      editorial = await runEditorial(
        opts.ai.model,
        {
          prefs,
          editionDate,
          stories: plan.stories.map((s, i) => ({
            article: snapshots[i]!,
            cachedSummary: cachedById.get(snapshots[i]!.id) ?? null,
            earlier: i < BIGGER_PICTURE_AT_GENERATION ? findEarlierCoverage(snapshots[i]!, history) : [],
            wantsBiggerPicture: i < BIGGER_PICTURE_AT_GENERATION,
          })),
        },
        { timeoutMs: opts.ai.timeoutMs, maxOutputTokens: opts.ai.maxOutputTokens },
      );
      const fresh = [...editorial.summaries.entries()].filter(([id]) => !cachedById.has(id));
      if (fresh.length) {
        await store.saveCachedSummaries(fresh.map(([articleId, v]) => ({ articleId, summary: v.summary, model: opts.ai!.modelId, createdAt: now.toISOString() })));
      }
      if (editorial.rejected.length) log("ai_rejected_items", { count: editorial.rejected.length, reasons: editorial.rejected.slice(0, 10) });
      log("ai_editorial", { usage: editorial.usage, summaries: editorial.summaries.size });
    } catch (err) {
      log("ai_failed", { error: (err as Error).message?.slice(0, 200) });
      aiNote = "The AI editor was unavailable for this edition, so summaries come from publishers' descriptions.";
      editorial = null;
    }
  }

  const summaryLimit = SUMMARY_CHARS[prefs.depth];
  const stories: EditionStory[] = plan.stories.map((s: PlannedStory, position) => {
    const article = snapshots[position]!;
    const ai = editorial?.summaries.get(article.id);
    const bp =
      position < BIGGER_PICTURE_AT_GENERATION
        ? editorial?.biggerPictures.get(article.id) ?? evidenceBiggerPicture(article, snapshots, history, s.alsoReportedBy)
        : null;
    return {
      position,
      section: s.section,
      tier: s.tier,
      article,
      summary: ai?.summary ?? (article.excerpt ? truncateText(article.excerpt, summaryLimit) : ""),
      summarySource: ai ? "ai" : "source",
      whyItMatters: ai?.whyItMatters ?? null,
      reasons: s.scored.reasons,
      score: s.scored.score,
      scoreBreakdown: s.scored.breakdown,
      alsoReportedBy: s.alsoReportedBy,
      biggerPicture: bp,
    };
  });

  const evidenceThings = evidenceThreeThings(stories.map((s) => ({ article: s.article, score: s.score })), prefs);
  const aiThings = editorial?.threeThings ?? [];
  const threeThings = [...aiThings, ...evidenceThings.filter((e) => !aiThings.some((a) => a.articleIds.some((id) => e.articleIds.includes(id))))].slice(0, 3);

  const aiUsed = Boolean(editorial && (editorial.summaries.size > 0 || editorial.intro));
  const edition: Edition = {
    id: randomUUID(),
    userId,
    editionDate,
    revision,
    createdAt: now.toISOString(),
    contentMode,
    readerName: prefs.displayName,
    intro: editorial?.intro ?? templateIntro(prefs.displayName, snapshots[0], plan.sections.map((s) => s.title), stories.length),
    introSource: editorial?.intro ? "ai" : "template",
    preferencesSnapshot: prefs,
    ranking: {
      version: RANKING_VERSION,
      weights: { ...WEIGHTS },
      candidateCount: plan.candidateCount,
      feedbackSignals: learned.signalCount,
      learnedTopics: topicWeights(learned),
    },
    ai: {
      used: aiUsed,
      provider: aiUsed ? opts.ai?.provider ?? null : null,
      model: aiUsed ? opts.ai?.modelId ?? null : null,
      note: aiNote,
    },
    sections: plan.sections,
    stories,
    threeThings,
  };

  const { edition: stored, created } = await store.insertEdition(edition);
  log("edition_saved", { editionId: stored.id, created, revision, stories: stories.length, contentMode, aiUsed });
  return { edition: stored, created, aiUsed, ingestion };
}
