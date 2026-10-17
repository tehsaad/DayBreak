import { runBiggerPicture } from "../ai/editorial";
import type { Store } from "../store/types";
import type { BiggerPicture, Edition } from "../types";
import { evidenceBiggerPicture, findEarlierCoverage } from "./evidence";
import type { AiHandle } from "./generate";

/**
 * Return the Bigger Picture for one story of a saved edition, generating and persisting it the
 * first time. Comparisons only use the reader's editions published before this one.
 */
export async function ensureBiggerPicture(opts: {
  store: Store;
  userId: string;
  edition: Edition;
  position: number;
  ai: AiHandle | null;
  log?: (msg: string, data?: Record<string, unknown>) => void;
}): Promise<{ biggerPicture: BiggerPicture; generated: boolean }> {
  const { store, userId, edition, position, ai } = opts;
  const story = edition.stories.find((s) => s.position === position);
  if (!story) throw new Error("Story not found");
  if (story.biggerPicture) return { biggerPicture: story.biggerPicture, generated: false };

  const summaries = (await store.listEditions(userId, 10)).filter((e) => e.createdAt < edition.createdAt && e.editionDate !== edition.editionDate).slice(0, 7);
  const history = (await Promise.all(summaries.map((e) => store.getEdition(userId, e.id)))).filter((e): e is Edition => Boolean(e));
  const articles = edition.stories.map((s) => s.article);

  let bp: BiggerPicture | null = null;
  if (ai) {
    try {
      bp = await runBiggerPicture(
        ai.model,
        {
          prefs: edition.preferencesSnapshot,
          editionDate: edition.editionDate,
          story: { article: story.article, cachedSummary: story.summarySource === "ai" ? story.summary : null, earlier: findEarlierCoverage(story.article, history), wantsBiggerPicture: true },
          others: edition.stories.filter((s) => s.position !== position).map((s) => ({ article: s.article, cachedSummary: null, earlier: [], wantsBiggerPicture: false })),
        },
        { timeoutMs: ai.timeoutMs, maxOutputTokens: ai.maxOutputTokens },
      );
    } catch (err) {
      opts.log?.("bigger_picture_ai_failed", { error: (err as Error).message?.slice(0, 200) });
    }
  }
  bp ??= evidenceBiggerPicture(story.article, articles, history, story.alsoReportedBy);
  await store.saveBiggerPicture(userId, edition.id, position, bp);
  return { biggerPicture: bp, generated: true };
}
