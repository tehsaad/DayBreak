import type { Metadata } from "next";
import Link from "next/link";
import { PaperView } from "@/components/paper/paper-view";
import { GenerateButton } from "@/components/paper/generate-button";
import { StatusStrip } from "@/components/paper/status-strip";
import { nextDelivery } from "@/lib/workflow/schedule";
import { formatEditionDate } from "@/components/paper/format";
import { editionDateFor } from "@/lib/preferences";
import { requireReader } from "@/lib/server/page-reader";
import { storageMode } from "@/lib/env";

export const metadata: Metadata = { title: "Today's paper" };
export const dynamic = "force-dynamic";

export default async function PaperPage({ searchParams }: PageProps<"/newspaper">) {
  const { reader, prefs } = await requireReader("/newspaper");
  const sp = await searchParams;
  const today = editionDateFor(prefs.timezone);
  const latest = await reader.store.latestEdition(reader.userId);

  if (latest && latest.editionDate === today && !sp.new) {
    const [bookmarks, runs] = await Promise.all([reader.store.listBookmarks(reader.userId), reader.store.listWorkflowRuns(reader.userId, 5).catch(() => [])]);
    const saved = bookmarks.map((b) => b.articleId);
    const todayDone = runs.some((r) => r.idempotencyKey === `scheduled:${today}` && r.status === "succeeded");
    return (
      <>
        <StatusStrip edition={latest} prefs={prefs} lastRun={runs[0] ?? null} next={nextDelivery(prefs, new Date(), { todayDone })} />
        <PaperView edition={latest} savedIds={saved} isToday isLatest storageMode={storageMode()} />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
      <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-muted">{formatEditionDate(today)}</p>
      <h1 className="mt-3 font-display text-5xl font-extrabold tracking-tight sm:text-6xl">
        {prefs.displayName ? `Good morning, ${prefs.displayName}.` : "Good morning."}
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
        Today&apos;s paper hasn&apos;t been printed yet. DAYBREAK will gather the latest reporting from its sources, rank it for your interests and lay it out as your front page.
      </p>
      <div className="mt-8">
        <GenerateButton />
      </div>
      {latest ? (
        <p className="mt-10 font-sans text-sm text-muted">
          Or read your last edition, from{" "}
          <Link className="font-semibold text-ink underline" href={`/newspaper/${latest.id}`}>{formatEditionDate(latest.editionDate)}</Link>.
        </p>
      ) : null}
    </div>
  );
}
