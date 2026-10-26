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
import type { Delivery, WorkflowRun } from "../workflow/types";

/** Another workflow is already running for this reader. */
export class RunBusyError extends Error {
  readonly transient = true;
  constructor() {
    super("Another run is already in progress for this reader");
    this.name = "RunBusyError";
  }
}

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
  /** contentHash() of the article text the summary was written from; null for legacy rows. */
  contentHash?: string | null;
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
  /** A short lease so only one instance refreshes news at a time. True when acquired. */
  claimIngestLock(holder: string, seconds: number): Promise<boolean>;
  releaseIngestLock(holder: string): Promise<void>;
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

  // Workflow runs and deliveries (reader-owned; the scheduler uses the service store)
  /** Insert unless (userId, idempotencyKey) exists; throws RunBusyError if another run is running. */
  createWorkflowRun(run: WorkflowRun): Promise<{ run: WorkflowRun; created: boolean }>;
  /** Replace a run's mutable fields; throws RunBusyError if it would make a second run "running". */
  saveWorkflowRun(run: WorkflowRun): Promise<void>;
  getWorkflowRun(userId: string, runId: string): Promise<WorkflowRun | null>;
  /**
   * Conditional cancel: a running run gets cancelRequested (honoured at the next stage boundary);
   * a failed or partial run becomes "cancelled". Only the flag/status changes, and only while the
   * run is still in that state, so it can never overwrite a run that finished meanwhile.
   * Returns the updated run, or null when the precondition no longer holds.
   */
  requestCancel(userId: string, runId: string, now: string): Promise<WorkflowRun | null>;
  findWorkflowRun(userId: string, idempotencyKey: string): Promise<WorkflowRun | null>;
  listWorkflowRuns(userId: string, limit?: number): Promise<WorkflowRun[]>;
  getDelivery(userId: string, key: string): Promise<Delivery | null>;
  saveDelivery(delivery: Delivery): Promise<void>;
  listDeliveries(userId: string, limit?: number): Promise<Delivery[]>;

  // Cron (service credentials only)
  listReadersForPreparation(limit: number): Promise<string[]>;
  /** The reader's account email (service credentials), or null. */
  getReaderEmail(userId: string): Promise<string | null>;
}
