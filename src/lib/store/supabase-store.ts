import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../env";
import { SOURCE_BY_ID } from "../news/sources";
import { hydratePreferences } from "../preferences";
import type { TopicId } from "../topics";
import type {
  Article,
  ArticleSnapshot,
  BiggerPicture,
  Bookmark,
  Edition,
  EditionStory,
  EditionSummary,
  FeedbackEvent,
  IngestionRun,
  ReaderPreferences,
  SourceHealth,
} from "../types";
import type { ArticleQuery, CachedSummary, FeedbackDeleteFilter, Store } from "./types";

type Row = Record<string, unknown>;

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase ${what} failed: ${res.error.message}`);
  return res.data;
}

const articleToRow = (a: Article): Row => ({
  id: a.id,
  url: a.url,
  title: a.title,
  description: a.description,
  publisher: a.publisher,
  source_id: SOURCE_BY_ID[a.sourceId] ? a.sourceId : null,
  author: a.author,
  image_url: a.imageUrl,
  published_at: a.publishedAt,
  collected_at: a.collectedAt,
  topics: a.topics,
  regions: a.regions,
  categories: a.categories,
  sample: a.sample,
});

const rowToArticle = (r: Row): Article => ({
  id: r.id as string,
  url: r.url as string,
  title: r.title as string,
  description: (r.description as string) ?? "",
  publisher: r.publisher as string,
  sourceId: (r.source_id as string) ?? "unknown",
  author: (r.author as string) ?? null,
  imageUrl: (r.image_url as string) ?? null,
  publishedAt: (r.published_at as string) ?? null,
  collectedAt: r.collected_at as string,
  topics: (r.topics as TopicId[]) ?? [],
  regions: (r.regions as string[]) ?? [],
  categories: (r.categories as string[]) ?? [],
  sample: Boolean(r.sample),
});

const ARTICLE_COLUMNS = "id,url,title,description,publisher,source_id,author,image_url,published_at,collected_at,topics,regions,categories,sample";

function storyToRow(s: EditionStory): Row {
  return {
    position: s.position,
    article_id: s.article.id,
    section: s.section,
    tier: s.tier,
    article: s.article,
    summary: s.summary,
    summary_source: s.summarySource,
    why_it_matters: s.whyItMatters,
    reasons: s.reasons,
    score: s.score,
    score_breakdown: s.scoreBreakdown,
    also_reported_by: s.alsoReportedBy,
    bigger_picture: s.biggerPicture,
  };
}

function rowToStory(r: Row): EditionStory {
  return {
    position: r.position as number,
    section: r.section as string,
    tier: r.tier as EditionStory["tier"],
    article: r.article as ArticleSnapshot,
    summary: r.summary as string,
    summarySource: r.summary_source as EditionStory["summarySource"],
    whyItMatters: (r.why_it_matters as string) ?? null,
    reasons: (r.reasons as EditionStory["reasons"]) ?? [],
    score: Number(r.score),
    scoreBreakdown: (r.score_breakdown as Record<string, number>) ?? {},
    alsoReportedBy: (r.also_reported_by as EditionStory["alsoReportedBy"]) ?? [],
    biggerPicture: (r.bigger_picture as BiggerPicture) ?? null,
  };
}

function rowToEdition(r: Row, stories: Row[]): Edition {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    editionDate: r.edition_date as string,
    revision: r.revision as number,
    createdAt: r.created_at as string,
    contentMode: r.content_mode as Edition["contentMode"],
    readerName: (r.reader_name as string) ?? "",
    intro: r.intro as string,
    introSource: r.intro_source as Edition["introSource"],
    preferencesSnapshot: r.preferences_snapshot as ReaderPreferences,
    ranking: r.ranking as Edition["ranking"],
    ai: r.ai as Edition["ai"],
    sections: r.sections as Edition["sections"],
    threeThings: r.three_things as Edition["threeThings"],
    stories: stories.map(rowToStory).sort((a, b) => a.position - b.position),
  };
}

// Only the lead headline is needed for lists, so fetch each story's title, not its full snapshot.
const EDITION_SUMMARY_COLUMNS = "id,edition_date,revision,created_at,content_mode,edition_stories(position,title:article->>title)";

/**
 * Supabase implementation.
 *  - `user`: a client carrying the reader's session (anon key + JWT) — RLS applies.
 *  - `service`: service-role client used ONLY for shared news data and cron.
 * Reader-owned queries always go through `user`, and also filter on user_id explicitly.
 */
export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;

  /**
   * @param user     client carrying the reader's session (RLS applies)
   * @param service  service-role client, or null when SUPABASE_SERVICE_ROLE_KEY is not set
   * @param fallbackNews  where shared news lives when there is no service-role key (per-instance cache)
   */
  constructor(
    private readonly user: SupabaseClient,
    private readonly service: SupabaseClient | null,
    private readonly fallbackNews: Store,
  ) {}

  /** True when shared news is stored in Postgres (service-role key configured). */
  get sharedNewsInDatabase(): boolean {
    return this.service !== null;
  }

  private get svc(): SupabaseClient {
    if (!this.service) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    return this.service;
  }

  // ---- shared news: Postgres with the service role, otherwise the per-instance cache ----

  upsertArticles(articles: Article[]) {
    return this.service ? this.pg_upsertArticles(articles) : this.fallbackNews.upsertArticles(articles);
  }
  listArticles(query: ArticleQuery) {
    return this.service ? this.pg_listArticles(query) : this.fallbackNews.listArticles(query);
  }
  getArticles(ids: string[]) {
    return this.service ? this.pg_getArticles(ids) : this.fallbackNews.getArticles(ids);
  }
  getSourceHealth() {
    return this.service ? this.pg_getSourceHealth() : this.fallbackNews.getSourceHealth();
  }
  saveSourceHealth(health: SourceHealth[]) {
    return this.service ? this.pg_saveSourceHealth(health) : this.fallbackNews.saveSourceHealth(health);
  }
  recordIngestionRun(run: IngestionRun) {
    return this.service ? this.pg_recordIngestionRun(run) : this.fallbackNews.recordIngestionRun(run);
  }
  lastIngestionRun() {
    return this.service ? this.pg_lastIngestionRun() : this.fallbackNews.lastIngestionRun();
  }
  async claimIngestLock(holder: string, seconds: number) {
    if (!this.service) return this.fallbackNews.claimIngestLock(holder, seconds);
    const { data, error } = await this.svc.rpc("claim_ingest_lock", { p_holder: holder, p_seconds: seconds });
    // Fail open if the lock function is unavailable (e.g. migration not yet applied): ingestion is idempotent.
    return error ? true : data === true;
  }
  async releaseIngestLock(holder: string) {
    if (!this.service) return this.fallbackNews.releaseIngestLock(holder);
    await this.svc.rpc("release_ingest_lock", { p_holder: holder });
  }
  getCachedSummaries(ids: string[], model: string) {
    return this.service ? this.pg_getCachedSummaries(ids, model) : this.fallbackNews.getCachedSummaries(ids, model);
  }
  saveCachedSummaries(items: CachedSummary[]) {
    return this.service ? this.pg_saveCachedSummaries(items) : this.fallbackNews.saveCachedSummaries(items);
  }

  // ---- shared news ---------------------------------------------------------------

  private async pg_upsertArticles(articles: Article[]): Promise<number> {
    if (articles.length === 0) return 0;
    await this.ensureSources();
    let inserted = 0;
    for (let i = 0; i < articles.length; i += 500) {
      const chunk = articles.slice(i, i + 500);
      const existing = check(await this.svc.from("articles").select("id").in("id", chunk.map((a) => a.id)), "article lookup") as Row[];
      const known = new Set(existing.map((r) => r.id as string));
      inserted += chunk.filter((a) => !known.has(a.id)).length;
      // New rows carry collected_at; known rows keep their first collected_at by omitting it.
      // They must be sent separately: PostgREST builds one column list from the union of all
      // rows in a request, so mixing them would write NULL into known rows' collected_at.
      const fresh = chunk.filter((a) => !known.has(a.id)).map(articleToRow);
      const updates = chunk.filter((a) => known.has(a.id)).map((a) => {
        const row = articleToRow(a);
        delete row.collected_at;
        return row;
      });
      if (fresh.length) check(await this.svc.from("articles").upsert(fresh, { onConflict: "id" }), "article upsert");
      if (updates.length) check(await this.svc.from("articles").upsert(updates, { onConflict: "id" }), "article update");
    }
    return inserted;
  }

  private sourcesEnsured = false;
  private async ensureSources() {
    if (this.sourcesEnsured) return;
    const rows = Object.values(SOURCE_BY_ID).map((s) => ({
      id: s.id,
      publisher: s.publisher,
      name: s.name,
      feed_url: s.feedUrl,
      homepage: s.homepage,
      topics: s.topics,
      region: s.region,
      status: s.status,
    }));
    check(await this.svc.from("sources").upsert(rows, { onConflict: "id", ignoreDuplicates: false }), "source registry sync");
    this.sourcesEnsured = true;
  }

  private async pg_listArticles(query: ArticleQuery): Promise<Article[]> {
    let q = this.svc.from("articles").select(ARTICLE_COLUMNS);
    if (query.sinceHours) {
      const since = new Date(Date.now() - query.sinceHours * 3600_000).toISOString();
      q = q.or(`published_at.gte.${since},and(published_at.is.null,collected_at.gte.${since})`);
    }
    if (query.topic) q = q.contains("topics", [query.topic]);
    if (query.sourceIds) q = q.in("source_id", query.sourceIds);
    if (query.publisher) q = q.eq("publisher", query.publisher);
    if (query.text) q = q.textSearch("search", query.text, { type: "websearch", config: "english" });
    const data = check(await q.order("published_at", { ascending: query.sort === "oldest", nullsFirst: false }).limit(query.limit ?? 500), "article list") as Row[];
    return data.map(rowToArticle);
  }

  private async pg_getArticles(ids: string[]): Promise<Article[]> {
    if (ids.length === 0) return [];
    const data = check(await this.svc.from("articles").select(ARTICLE_COLUMNS).in("id", ids), "article get") as Row[];
    return data.map(rowToArticle);
  }

  private async pg_getSourceHealth(): Promise<SourceHealth[]> {
    const data = check(await this.svc.from("sources").select("*"), "source health") as Row[];
    return data.map((r) => ({
      sourceId: r.id as string,
      lastFetchedAt: (r.last_fetched_at as string) ?? null,
      lastSuccessAt: (r.last_success_at as string) ?? null,
      lastStatus: (r.last_status as SourceHealth["lastStatus"]) ?? null,
      lastError: (r.last_error as string) ?? null,
      consecutiveFailures: (r.consecutive_failures as number) ?? 0,
      lastItemCount: (r.last_item_count as number) ?? 0,
      etag: (r.etag as string) ?? null,
      lastModified: (r.last_modified as string) ?? null,
    }));
  }

  private async pg_saveSourceHealth(health: SourceHealth[]): Promise<void> {
    await this.ensureSources();
    for (const h of health) {
      check(
        await this.svc
          .from("sources")
          .update({
            last_fetched_at: h.lastFetchedAt,
            last_success_at: h.lastSuccessAt,
            last_status: h.lastStatus,
            last_error: h.lastError,
            consecutive_failures: h.consecutiveFailures,
            last_item_count: h.lastItemCount,
            etag: h.etag,
            last_modified: h.lastModified,
            updated_at: new Date().toISOString(),
          })
          .eq("id", h.sourceId),
        "source health update",
      );
    }
  }

  private async pg_recordIngestionRun(run: IngestionRun): Promise<void> {
    check(
      await this.svc.from("ingestion_runs").insert({
        id: run.id,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        trigger: run.trigger,
        inserted: run.inserted,
        results: run.results,
        raw_items: run.rawItems ?? null,
        unique_items: run.uniqueItems ?? null,
      }),
      "ingestion run insert",
    );
  }

  private async pg_lastIngestionRun(): Promise<IngestionRun | null> {
    const data = check(await this.svc.from("ingestion_runs").select("*").order("finished_at", { ascending: false }).limit(1), "ingestion run") as Row[];
    const r = data[0];
    if (!r) return null;
    return {
      id: r.id as string,
      startedAt: r.started_at as string,
      finishedAt: r.finished_at as string,
      trigger: r.trigger as IngestionRun["trigger"],
      inserted: r.inserted as number,
      results: r.results as IngestionRun["results"],
      rawItems: (r.raw_items as number | null) ?? undefined,
      uniqueItems: (r.unique_items as number | null) ?? undefined,
    };
  }

  private async pg_getCachedSummaries(ids: string[], model: string): Promise<CachedSummary[]> {
    if (ids.length === 0) return [];
    const data = check(await this.svc.from("article_summaries").select("*").eq("model", model).in("article_id", ids), "summary cache") as Row[];
    return data.map((r) => ({ articleId: r.article_id as string, summary: r.summary as string, model: r.model as string, createdAt: r.created_at as string, contentHash: (r.content_hash as string | null) ?? null }));
  }

  private async pg_saveCachedSummaries(items: CachedSummary[]): Promise<void> {
    if (items.length === 0) return;
    // Only cache summaries for articles that exist in the shared table (FK).
    const known = new Set(((check(await this.svc.from("articles").select("id").in("id", items.map((i) => i.articleId)), "article lookup") as Row[]) ?? []).map((r) => r.id as string));
    const rows = items.filter((i) => known.has(i.articleId)).map((i) => ({ article_id: i.articleId, model: i.model, summary: i.summary, created_at: i.createdAt, content_hash: i.contentHash ?? null }));
    if (rows.length) check(await this.svc.from("article_summaries").upsert(rows, { onConflict: "article_id,model" }), "summary cache save");
  }

  // ---- reader data (RLS-bound client) ------------------------------------------------

  async getPreferences(userId: string): Promise<ReaderPreferences | null> {
    const data = check(await this.user.from("reader_preferences").select("prefs").eq("user_id", userId).maybeSingle(), "preferences") as Row | null;
    return hydratePreferences((data?.prefs as ReaderPreferences) ?? null);
  }

  async savePreferences(userId: string, prefs: ReaderPreferences): Promise<void> {
    check(
      await this.user.from("reader_preferences").upsert({
        user_id: userId,
        prefs,
        region: prefs.region,
        onboarded_at: prefs.onboardedAt,
        updated_at: new Date().toISOString(),
      }),
      "preferences save",
    );
    if (prefs.displayName) await this.user.from("profiles").upsert({ id: userId, display_name: prefs.displayName });
  }

  async listEditions(userId: string, limit = 60): Promise<EditionSummary[]> {
    const data = check(
      await this.user
        .from("editions")
        .select(EDITION_SUMMARY_COLUMNS)
        .eq("user_id", userId)
        .order("edition_date", { ascending: false })
        .order("revision", { ascending: false })
        .limit(limit),
      "edition list",
    ) as Row[];
    return data.map((r) => {
      const stories = ((r.edition_stories as Row[]) ?? []).sort((a, b) => (a.position as number) - (b.position as number));
      return {
        id: r.id as string,
        editionDate: r.edition_date as string,
        revision: r.revision as number,
        createdAt: r.created_at as string,
        contentMode: r.content_mode as EditionSummary["contentMode"],
        leadTitle: (stories[0]?.title as string | undefined) ?? "",
        storyCount: stories.length,
      };
    });
  }

  async getEdition(userId: string, editionId: string): Promise<Edition | null> {
    if (!/^[0-9a-f-]{36}$/i.test(editionId)) return null;
    // One round trip: the edition with its stories embedded.
    const e = check(await this.user.from("editions").select("*, edition_stories(*)").eq("id", editionId).eq("user_id", userId).maybeSingle(), "edition get") as Row | null;
    if (!e) return null;
    return rowToEdition(e, (e.edition_stories as Row[]) ?? []);
  }

  async latestEdition(userId: string, editionDate?: string): Promise<Edition | null> {
    let q = this.user.from("editions").select("*, edition_stories(*)").eq("user_id", userId);
    if (editionDate) q = q.eq("edition_date", editionDate);
    const data = check(await q.order("edition_date", { ascending: false }).order("revision", { ascending: false }).limit(1), "latest edition") as Row[];
    return data[0] ? rowToEdition(data[0], (data[0].edition_stories as Row[]) ?? []) : null;
  }

  async latestEditionId(userId: string): Promise<string | null> {
    const data = check(
      await this.user.from("editions").select("id").eq("user_id", userId).order("edition_date", { ascending: false }).order("revision", { ascending: false }).limit(1),
      "latest edition id",
    ) as Row[];
    return (data[0]?.id as string) ?? null;
  }

  async insertEdition(edition: Edition): Promise<{ edition: Edition; created: boolean }> {
    const payload = {
      id: edition.id,
      user_id: edition.userId,
      edition_date: edition.editionDate,
      revision: edition.revision,
      created_at: edition.createdAt,
      content_mode: edition.contentMode,
      reader_name: edition.readerName,
      intro: edition.intro,
      intro_source: edition.introSource,
      preferences_snapshot: edition.preferencesSnapshot,
      ranking: edition.ranking,
      ai: edition.ai,
      sections: edition.sections,
      three_things: edition.threeThings,
    };
    const data = check(await this.user.rpc("create_edition", { edition: payload, stories: edition.stories.map(storyToRow) }), "create_edition") as Row[] | Row;
    const row = Array.isArray(data) ? data[0] : data;
    const id = (row?.edition_id as string) ?? edition.id;
    const created = Boolean(row?.created);
    if (created) return { edition, created };
    const existing = await this.getEdition(edition.userId, id);
    if (!existing) throw new Error("Edition conflict but existing edition not readable");
    return { edition: existing, created: false };
  }

  async saveBiggerPicture(userId: string, editionId: string, position: number, bp: BiggerPicture): Promise<void> {
    check(
      await this.user.from("edition_stories").update({ bigger_picture: bp }).eq("edition_id", editionId).eq("position", position).eq("user_id", userId),
      "bigger picture save",
    );
  }

  async recordFeedback(event: FeedbackEvent): Promise<{ deduplicated: boolean }> {
    const row = {
      id: event.id,
      user_id: event.userId,
      article_id: event.articleId,
      edition_id: event.editionId,
      type: event.type,
      topics: event.topics,
      publisher: event.publisher,
      title: event.title,
      value: event.value,
      created_at: event.createdAt,
    };
    if (!event.articleId) {
      check(await this.user.from("feedback_events").insert(row), "feedback insert");
      return { deduplicated: false };
    }
    const existing = check(
      await this.user.from("feedback_events").select("id").eq("user_id", event.userId).eq("article_id", event.articleId).eq("type", event.type).maybeSingle(),
      "feedback lookup",
    ) as Row | null;
    if (existing) {
      check(await this.user.from("feedback_events").update({ created_at: event.createdAt, value: event.value }).eq("id", existing.id as string), "feedback update");
      return { deduplicated: true };
    }
    const res = await this.user.from("feedback_events").insert(row);
    // A concurrent duplicate hits the partial unique index; treat as deduplicated.
    if (res.error && /duplicate key/i.test(res.error.message)) return { deduplicated: true };
    check(res, "feedback insert");
    return { deduplicated: false };
  }

  async listFeedback(userId: string, sinceDays: number): Promise<FeedbackEvent[]> {
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    const data = check(
      await this.user.from("feedback_events").select("*").eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
      "feedback list",
    ) as Row[];
    return data.map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      articleId: (r.article_id as string) ?? null,
      editionId: (r.edition_id as string) ?? null,
      type: r.type as FeedbackEvent["type"],
      topics: (r.topics as TopicId[]) ?? [],
      publisher: (r.publisher as string) ?? null,
      title: (r.title as string) ?? null,
      value: (r.value as number) ?? null,
      createdAt: r.created_at as string,
    }));
  }

  async deleteFeedback(userId: string, filter: FeedbackDeleteFilter): Promise<number> {
    if (filter.articleId) {
      let q = this.user.from("feedback_events").delete({ count: "exact" }).eq("user_id", userId).eq("article_id", filter.articleId);
      if (filter.type) q = q.eq("type", filter.type);
      const res = await q;
      check(res, "feedback delete");
      return res.count ?? 0;
    }
    if (filter.all) {
      const res = await this.user.from("feedback_events").delete({ count: "exact" }).eq("user_id", userId);
      check(res, "feedback delete");
      return res.count ?? 0;
    }
    if (!filter.topic) return 0;
    // Events whose primary topic is `topic`.
    const ids = (await this.listFeedback(userId, 3650)).filter((e) => e.topics[0] === filter.topic).map((e) => e.id);
    if (ids.length === 0) return 0;
    check(await this.user.from("feedback_events").delete().in("id", ids).eq("user_id", userId), "feedback delete");
    return ids.length;
  }

  async listBookmarks(userId: string): Promise<Bookmark[]> {
    const data = check(await this.user.from("saved_articles").select("*").eq("user_id", userId).order("saved_at", { ascending: false }), "bookmarks") as Row[];
    return data.map((r) => ({
      userId: r.user_id as string,
      articleId: r.article_id as string,
      editionId: (r.edition_id as string) ?? null,
      article: r.article as ArticleSnapshot,
      savedAt: r.saved_at as string,
    }));
  }

  async addBookmark(b: Bookmark): Promise<void> {
    check(
      await this.user
        .from("saved_articles")
        .upsert({ user_id: b.userId, article_id: b.articleId, edition_id: b.editionId, article: b.article, saved_at: b.savedAt }, { onConflict: "user_id,article_id", ignoreDuplicates: true }),
      "bookmark add",
    );
  }

  async removeBookmark(userId: string, articleId: string): Promise<void> {
    check(await this.user.from("saved_articles").delete().eq("user_id", userId).eq("article_id", articleId), "bookmark remove");
  }

  async listReadersForPreparation(limit: number): Promise<string[]> {
    // Listing every reader requires the service role; without it, cron preparation is skipped.
    if (!this.service) return [];
    const data = check(
      await this.svc.from("reader_preferences").select("user_id").not("onboarded_at", "is", null).order("updated_at", { ascending: false }).limit(limit),
      "reader list",
    ) as Row[];
    return data.map((r) => r.user_id as string);
  }

  /** Materialise inferred interests for inspection. */
  async saveAffinities(userId: string, weights: Partial<Record<TopicId, { weight: number; events: number }>>): Promise<void> {
    const rows = Object.entries(weights).map(([topic, v]) => ({ user_id: userId, topic, weight: v!.weight, events: v!.events, updated_at: new Date().toISOString() }));
    check(await this.user.from("topic_affinities").delete().eq("user_id", userId), "affinity reset");
    if (rows.length) check(await this.user.from("topic_affinities").insert(rows), "affinity save");
  }
}

let serviceClient: SupabaseClient | null = null;

/** Service-role client, or null when SUPABASE_SERVICE_ROLE_KEY is not configured. Server-only. */
export function serviceSupabase(): SupabaseClient | null {
  const cfg = supabaseConfig();
  if (!cfg?.serviceRoleKey) return null;
  serviceClient ??= createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return serviceClient;
}

/** Service-role store (cron, ingestion scripts). Reader methods then act with service rights. */
export function createServiceStore(fallbackNews: Store): SupabaseStore {
  const svc = serviceSupabase();
  if (!svc) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return new SupabaseStore(svc, svc, fallbackNews);
}

/** Store for one signed-in reader: their data through their own session (RLS). */
export function createReaderStore(userClient: SupabaseClient, fallbackNews: Store): SupabaseStore {
  return new SupabaseStore(userClient, serviceSupabase(), fallbackNews);
}
