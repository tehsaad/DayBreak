import type { TopicId } from "./topics";

export type Depth = "brief" | "balanced" | "deep";

export interface ReaderPreferences {
  displayName: string;
  /** Followed topics, in the order the reader wants their sections. */
  sections: TopicId[];
  /** Fine-grained interest ids (see INTERESTS). */
  interests: string[];
  /** Region code (e.g. "PK") or "GLOBAL". */
  region: string;
  /** 0 = international only, 1 = local only. */
  localBalance: number;
  depth: Depth;
  mutedTopics: TopicId[];
  excludedSources: string[];
  mutedKeywords: string[];
  /** Target reading time in minutes. */
  readingMinutes: number;
  /** IANA time zone, used to decide which day an edition belongs to. */
  timezone: string;
  onboardedAt: string | null;
  updatedAt: string | null;
}

export interface Article {
  id: string;
  url: string;
  title: string;
  /** Short excerpt from the feed description (never the full article). */
  description: string;
  publisher: string;
  sourceId: string;
  author: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  collectedAt: string;
  topics: TopicId[];
  regions: string[];
  categories: string[];
  /** True for the clearly labelled offline sample set. */
  sample: boolean;
}

export type SourceStatus = "active" | "disabled";

export interface SourceHealth {
  sourceId: string;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: FetchOutcome | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastItemCount: number;
  etag: string | null;
  lastModified: string | null;
}

export type FetchOutcome = "ok" | "empty" | "not_modified" | "error" | "rate_limited" | "skipped_fresh" | "skipped_backoff" | "skipped_budget";

export interface ReasonItem {
  code:
    | "interest"
    | "topic"
    | "region"
    | "learned"
    | "coverage"
    | "major"
    | "broaden"
    | "fresh";
  text: string;
}

export interface ArticleSnapshot {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  publisher: string;
  sourceId: string;
  author: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  topics: TopicId[];
  regions: string[];
  sample: boolean;
}

export interface EvidenceRef {
  articleId: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
}

export interface EarlierCoverage {
  editionId: string;
  editionDate: string;
  title: string;
  publisher: string;
  url: string;
}

export interface BiggerPicture {
  /** "ai" when a model wrote the prose; "evidence" when assembled deterministically from metadata. */
  source: "ai" | "evidence";
  whatHappened: string;
  whyItMatters: string | null;
  background: string | null;
  connections: { articleId: string; title: string; relation: string }[];
  earlierCoverage: EarlierCoverage[];
  whatChanged: string | null;
  /** Interpretation, never presented as fact. */
  watchNext: string | null;
  question: string;
  evidence: EvidenceRef[];
  insufficient: boolean;
  note: string | null;
}

export type StoryTier = "lead" | "top" | "standard" | "brief";

export interface EditionStory {
  position: number;
  section: string;
  tier: StoryTier;
  article: ArticleSnapshot;
  summary: string;
  summarySource: "ai" | "source";
  whyItMatters: string | null;
  reasons: ReasonItem[];
  score: number;
  scoreBreakdown: Record<string, number>;
  /** Other publishers that carried the same story today. */
  alsoReportedBy: EvidenceRef[];
  biggerPicture: BiggerPicture | null;
}

export interface KnowledgeItem {
  headline: string;
  /** Statement supported by the linked stories' source text. */
  fact: string;
  /** Clearly labelled interpretation, or null. */
  interpretation: string | null;
  regionalNote: string | null;
  articleIds: string[];
  source: "ai" | "evidence";
}

export interface EditionSection {
  id: string;
  title: string;
  positions: number[];
}

export interface Edition {
  id: string;
  userId: string;
  editionDate: string;
  revision: number;
  createdAt: string;
  /** "live" when built from fetched feeds, "sample" when built from the labelled offline sample set. */
  contentMode: "live" | "sample";
  readerName: string;
  intro: string;
  introSource: "ai" | "template";
  preferencesSnapshot: ReaderPreferences;
  ranking: {
    version: string;
    weights: Record<string, number>;
    candidateCount: number;
    feedbackSignals: number;
    learnedTopics: Partial<Record<TopicId, number>>;
  };
  ai: {
    used: boolean;
    provider: string | null;
    model: string | null;
    note: string | null;
  };
  sections: EditionSection[];
  stories: EditionStory[];
  threeThings: KnowledgeItem[];
}

export interface EditionSummary {
  id: string;
  editionDate: string;
  revision: number;
  createdAt: string;
  leadTitle: string;
  storyCount: number;
  contentMode: "live" | "sample";
}

export const FEEDBACK_TYPES = ["open", "save", "unsave", "skip", "not_interested", "rating", "follow_topic", "unfollow_topic"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export interface FeedbackEvent {
  id: string;
  userId: string;
  articleId: string | null;
  editionId: string | null;
  type: FeedbackType;
  /** Topics of the article (primary first) or the followed/unfollowed topic. */
  topics: TopicId[];
  publisher: string | null;
  title: string | null;
  /** Rating 1-5 for "rating" events. */
  value: number | null;
  createdAt: string;
}

export interface Bookmark {
  userId: string;
  articleId: string;
  editionId: string | null;
  article: ArticleSnapshot;
  savedAt: string;
}

export interface IngestionRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  trigger: "cron" | "on_demand" | "script";
  results: { sourceId: string; outcome: FetchOutcome; items: number; error?: string; ms: number }[];
  inserted: number;
}
