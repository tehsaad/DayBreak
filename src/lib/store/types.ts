import type {
  Article,
  BiggerPicture,
  Bookmark,
  Edition,
  EditionSummary,
  FeedbackEvent,
  IngestionRun,
  ReaderPreferences,
  SourceHealth,
} from "../types";
import type { TopicId } from "../topics";

export interface ArticleQuery {
  sinceHours?: number;
  limit?: number;
  text?: string;
  topic?: TopicId;
  sourceIds?: string[];
  /** Exact publisher name. */
  publisher?: string;
  /** Default newest first. */
  sort?: "newest" | "oldest";
}

/** Delete learned signals: all, one topic (by primary topic) or one event (article + type). */
export interface FeedbackDeleteFilter {
  all?: boolean;
  topic?: TopicId;
  articleId?: string;
  type?: FeedbackEvent["type"];
}

/** Article-level AI summary cache (not personalised, so it can be shared across readers). */
export interface CachedSummary {
  articleId: string;
  summary: string;
  model: string;
  createdAt: string;
}

/**
 * Persistence boundary. Every user-scoped method takes the userId explicitly AND the
 * Supabase implementation runs those calls with the reader's own session so Row Level
 * Security enforces ownership a second time.
 */
export interface Store {
  readonly kind: "supabase" | "file";

  // Shared news data (written by ingestion with server credentials)
  upsertArticles(articles: Article[]): Promise<number>;
  listArticles(query: ArticleQuery): Promise<Article[]>;
  getArticles(ids: string[]): Promise<Article[]>;
  getSourceHealth(): Promise<SourceHealth[]>;
  saveSourceHealth(health: SourceHealth[]): Promise<void>;
  recordIngestionRun(run: IngestionRun): Promise<void>;
  lastIngestionRun(): Promise<IngestionRun | null>;
  getCachedSummaries(ids: string[], model: string): Promise<CachedSummary[]>;
  saveCachedSummaries(items: CachedSummary[]): Promise<void>;

  // Reader-owned data
  getPreferences(userId: string): Promise<ReaderPreferences | null>;
  savePreferences(userId: string, prefs: ReaderPreferences): Promise<void>;

  listEditions(userId: string, limit?: number): Promise<EditionSummary[]>;
  getEdition(userId: string, editionId: string): Promise<Edition | null>;
  latestEdition(userId: string, editionDate?: string): Promise<Edition | null>;
  /** Id of the reader's newest edition, without loading it. */
  latestEditionId(userId: string): Promise<string | null>;
  /** Insert unless (userId, editionDate, revision) already exists; returns the stored edition. */
  insertEdition(edition: Edition): Promise<{ edition: Edition; created: boolean }>;
  saveBiggerPicture(userId: string, editionId: string, position: number, bp: BiggerPicture): Promise<void>;

  /** Insert a feedback event; repeated (user, article, type) events update the timestamp instead. */
  recordFeedback(event: FeedbackEvent): Promise<{ deduplicated: boolean }>;
  listFeedback(userId: string, sinceDays: number): Promise<FeedbackEvent[]>;
  deleteFeedback(userId: string, filter: FeedbackDeleteFilter): Promise<number>;

  listBookmarks(userId: string): Promise<Bookmark[]>;
  addBookmark(bookmark: Bookmark): Promise<void>;
  removeBookmark(userId: string, articleId: string): Promise<void>;

  /** Materialised copy of inferred topic weights, for inspection. */
  saveAffinities(userId: string, weights: Partial<Record<TopicId, { weight: number; events: number }>>): Promise<void>;

  // Cron (service credentials only)
  listReadersForPreparation(limit: number): Promise<string[]>;
}
