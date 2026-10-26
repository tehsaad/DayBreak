import { numbersGrounded } from "../ai/editorial";
import { dropsHedge, inventsName } from "../ai/summaries";
import { displayExcerpt } from "../news/rights";
import { safeLinkUrl } from "../security/url";
import type { EditionStory } from "../types";

export type VerifyProblem = "number_not_in_source" | "name_not_in_source" | "drops_hedge" | "unsafe_or_missing_url" | "missing_publisher";

export interface VerifyReport {
  checked: number;
  aiSummaries: number;
  sourceSummaries: number;
  /** AI summaries replaced by the publisher's excerpt because they failed a grounding check. */
  reverted: number;
  problems: { position: number; problem: VerifyProblem }[];
}

/**
 * Final, deterministic grounding audit of an edition before it is published. This is not
 * fact-checking: it can only confirm that an AI summary does not introduce numbers or names that
 * are absent from the source text DAYBREAK actually has (headline + feed excerpt), and that a
 * hedged claim ("reportedly") is not restated as plain fact. Failing summaries fall back to the
 * publisher's own excerpt and are labelled as such. Every story must link to its original source.
 */
export function verifyStories(stories: EditionStory[]): { stories: EditionStory[]; report: VerifyReport } {
  const report: VerifyReport = { checked: stories.length, aiSummaries: 0, sourceSummaries: 0, reverted: 0, problems: [] };
  const out = stories.map((story) => {
    if (!safeLinkUrl(story.article.url)) report.problems.push({ position: story.position, problem: "unsafe_or_missing_url" });
    if (!story.article.publisher.trim()) report.problems.push({ position: story.position, problem: "missing_publisher" });
    if (story.summarySource !== "ai") {
      report.sourceSummaries++;
      return story;
    }
    const source = `${story.article.title} ${story.article.excerpt} ${story.article.publisher}`;
    const problem: VerifyProblem | null = !numbersGrounded(story.summary, source)
      ? "number_not_in_source"
      : inventsName(story.summary, source)
        ? "name_not_in_source"
        : dropsHedge(story.summary, source)
          ? "drops_hedge"
          : null;
    if (!problem) {
      report.aiSummaries++;
      const why = story.whyItMatters;
      // "Why it matters" is interpretation, but it still may not introduce names or numbers.
      return why && (!numbersGrounded(why, source) || inventsName(why, source)) ? { ...story, whyItMatters: null } : story;
    }
    report.problems.push({ position: story.position, problem });
    report.reverted++;
    report.sourceSummaries++;
    return { ...story, summary: displayExcerpt(story.article.excerpt, story.article.sourceId), summarySource: "source" as const, whyItMatters: null };
  });
  return { stories: out, report };
}
