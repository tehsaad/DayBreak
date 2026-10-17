import { firstSentence, truncateText } from "../text";

/**
 * Publisher-content rules. DAYBREAK has NOT obtained licences from any publisher; it uses what
 * publishers distribute in public RSS/API feeds, conservatively:
 *  - headlines: shown with attribution and a link to the original;
 *  - excerpts: at most one short, quoted sentence (DISPLAY_EXCERPT_MAX) on any surface;
 *    a little more (STORED_EXCERPT_MAX) is kept server-side only to match and ground analysis;
 *  - full article text: never fetched, stored or shown;
 *  - images: the feed's own thumbnail URL, hotlinked (never copied or re-hosted), only where the
 *    source rule allows; otherwise neutral placeholder artwork;
 *  - AI: summaries/analysis are written fresh from headline + short excerpt, never reproductions.
 * Per-source terms are documented in docs/COPYRIGHT.md and still need human legal review.
 */
export const DISPLAY_EXCERPT_MAX = 200;
export const STORED_EXCERPT_MAX = 300;

export interface SourceRights {
  /** "short" = one quoted sentence; "none" = headline + link only. */
  excerpt: "short" | "none";
  images: boolean;
  ai: boolean;
}

const DEFAULT_RIGHTS: SourceRights = { excerpt: "short", images: true, ai: true };

/** Source-specific overrides (by source id prefix). Extend as publisher terms are reviewed. */
const OVERRIDES: Record<string, Partial<SourceRights>> = {};

export function rightsFor(sourceId: string): SourceRights {
  const key = Object.keys(OVERRIDES).find((k) => sourceId === k || sourceId.startsWith(`${k}-`));
  return { ...DEFAULT_RIGHTS, ...(key ? OVERRIDES[key] : {}) };
}

/** The only form of publisher text shown to readers: one short sentence, or nothing. */
export function displayExcerpt(text: string | null | undefined, sourceId = ""): string {
  if (!text || rightsFor(sourceId).excerpt === "none") return "";
  return truncateText(firstSentence(text, DISPLAY_EXCERPT_MAX), DISPLAY_EXCERPT_MAX);
}

export function storedExcerpt(text: string): string {
  return truncateText(text, STORED_EXCERPT_MAX);
}

export function allowedImage(url: string | null, sourceId: string): string | null {
  return url && rightsFor(sourceId).images ? url : null;
}

export function setRightsOverridesForTests(o: Record<string, Partial<SourceRights>>) {
  for (const k of Object.keys(OVERRIDES)) delete OVERRIDES[k];
  Object.assign(OVERRIDES, o);
}

/** Applies the display rule to everything an API returns, including editions stored before it existed. */
export function publicEdition<E extends { stories: { summary: string; summarySource: string; article: { sourceId: string; excerpt: string } }[] }>(edition: E): E {
  return {
    ...edition,
    stories: edition.stories.map((s) => ({
      ...s,
      summary: s.summarySource === "source" ? displayExcerpt(s.summary, s.article.sourceId) : s.summary,
      article: { ...s.article, excerpt: displayExcerpt(s.article.excerpt, s.article.sourceId) },
    })),
  };
}

export function publicBookmark<B extends { article: { sourceId: string; excerpt: string } }>(b: B): B {
  return { ...b, article: { ...b.article, excerpt: displayExcerpt(b.article.excerpt, b.article.sourceId) } };
}
