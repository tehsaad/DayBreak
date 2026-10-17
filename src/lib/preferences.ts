import { z } from "zod";
import { GLOBAL_REGION, INTEREST_BY_ID, REGION_BY_CODE, TOPIC_IDS, type TopicId } from "./topics";
import type { ReaderPreferences } from "./types";

const topicId = z.enum(TOPIC_IDS);

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Input accepted from onboarding/settings. Unknown fields are stripped. */
export const PreferencesInput = z
  .object({
    displayName: z.string().trim().max(40).default(""),
    sections: z.array(topicId).max(TOPIC_IDS.length).default([]),
    interests: z.array(z.string().max(40)).max(40).default([]),
    region: z.string().max(10).default(GLOBAL_REGION),
    localBalance: z.number().min(0).max(1).default(0.5),
    depth: z.enum(["brief", "balanced", "deep"]).default("balanced"),
    mutedTopics: z.array(topicId).max(TOPIC_IDS.length).default([]),
    excludedSources: z.array(z.string().max(60)).max(60).default([]),
    preferredPublishers: z.array(z.string().max(60)).max(30).default([]),
    language: z.literal("en").default("en"),
    mutedKeywords: z.array(z.string().trim().min(2).max(40)).max(30).default([]),
    readingMinutes: z.number().int().min(3).max(60).default(15),
    timezone: z.string().max(64).default("UTC"),
  })
  .strip();

export type PreferencesInput = z.input<typeof PreferencesInput>;

/**
 * Validate, normalise and make internally consistent.
 * `complete: false` saves an onboarding draft without marking the reader as onboarded.
 */
export function normalizePreferences(raw: unknown, previous?: ReaderPreferences | null, opts: { complete?: boolean } = {}): ReaderPreferences {
  const complete = opts.complete ?? true;
  const p = PreferencesInput.parse(raw);
  const interests = [...new Set(p.interests.filter((i) => INTEREST_BY_ID[i]))];
  const muted = [...new Set(p.mutedTopics)];
  // Interests imply following their topic; a muted topic cannot also be followed.
  const sections: TopicId[] = [...new Set([...p.sections, ...interests.map((i) => INTEREST_BY_ID[i]!.topic)])].filter((t) => !muted.includes(t));
  const region = p.region === GLOBAL_REGION || REGION_BY_CODE[p.region] ? p.region : GLOBAL_REGION;
  const now = new Date().toISOString();
  return {
    displayName: p.displayName.replace(/[<>]/g, ""),
    sections,
    interests: interests.filter((i) => !muted.includes(INTEREST_BY_ID[i]!.topic)),
    region,
    localBalance: region === GLOBAL_REGION ? 0.5 : Math.round(p.localBalance * 100) / 100,
    depth: p.depth,
    mutedTopics: muted,
    excludedSources: [...new Set(p.excludedSources)],
    // A publisher can't be both trusted and excluded; exclusion wins.
    preferredPublishers: [...new Set(p.preferredPublishers)].filter((id) => !p.excludedSources.includes(id)),
    language: "en",
    mutedKeywords: [...new Set(p.mutedKeywords.map((k) => k.toLowerCase()))],
    readingMinutes: p.readingMinutes,
    timezone: validTimezone(p.timezone) ? p.timezone : "UTC",
    onboardedAt: previous?.onboardedAt ?? (complete ? now : null),
    updatedAt: now,
  };
}

export const DEFAULT_PREFERENCES: ReaderPreferences = {
  displayName: "",
  sections: ["world", "ai-tech", "science", "business", "climate"],
  interests: [],
  region: GLOBAL_REGION,
  localBalance: 0.5,
  depth: "balanced",
  mutedTopics: [],
  excludedSources: [],
  preferredPublishers: [],
  mutedKeywords: [],
  language: "en",
  readingMinutes: 15,
  timezone: "UTC",
  onboardedAt: null,
  updatedAt: null,
};

/** Fill fields added after a profile was first saved, so older stored profiles keep working. */
export function hydratePreferences(p: ReaderPreferences | null): ReaderPreferences | null {
  if (!p) return null;
  return { ...DEFAULT_PREFERENCES, ...p, preferredPublishers: p.preferredPublishers ?? [], language: "en" };
}

/** YYYY-MM-DD of `now` in the reader's time zone. */
export function editionDateFor(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
