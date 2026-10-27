import { clampInt } from "./env";
import type { Edition } from "./types";

/** Words per minute for adult silent reading of non-fiction (configurable; an assumption, not a measurement). */
export const READING_WPM = clampInt(process.env.READING_WPM, 120, 400, 230);

export function countWords(text: string | null | undefined): number {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

/**
 * Estimated minutes to read an edition as DAYBREAK presents it: intro, every headline, summary
 * and "why it matters", and the Three Things. Excludes the linked original articles. Always shown
 * as an estimate.
 */
export function estimateEditionMinutes(edition: Pick<Edition, "intro" | "stories" | "threeThings">, wpm = READING_WPM): { words: number; minutes: number } {
  const words =
    countWords(edition.intro) +
    edition.stories.reduce((n, s) => n + countWords(s.article.title) + countWords(s.summary) + countWords(s.whyItMatters), 0) +
    edition.threeThings.reduce((n, t) => n + countWords(t.headline) + countWords(t.fact) + countWords(t.interpretation), 0);
  return { words, minutes: Math.max(1, Math.round(words / wpm)) };
}
