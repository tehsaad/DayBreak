import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { formatEditionDate } from "@/components/paper/format";
import { requireReader } from "@/lib/server/page-reader";

export const metadata: Metadata = { title: "Archive" };
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const { reader } = await requireReader("/archive");
  const editions = await reader.store.listEditions(reader.userId, 120);
  const byMonth = new Map<string, typeof editions>();
  for (const e of editions) {
    const month = new Date(`${e.editionDate}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    byMonth.set(month, [...(byMonth.get(month) ?? []), e]);
  }
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold tracking-tight">The archive</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">Every edition DAYBREAK has printed for you, preserved exactly as published — same stories, same order, same summaries. Download any of them again as a PDF.</p>
      {editions.length === 0 ? (
        <div className="mt-10 border border-dashed border-rule p-8 text-center">
          <p className="font-display text-2xl">No editions yet.</p>
          <p className="mt-2 text-ink-soft">Your first paper will appear here once it&apos;s printed.</p>
          <Link href="/newspaper" className="btn btn-primary mt-5">Go to today&apos;s paper</Link>
        </div>
      ) : (
        [...byMonth.entries()].map(([month, list]) => (
          <section key={month} className="mt-10" aria-labelledby={`m-${month}`}>
            <h2 id={`m-${month}`} className="border-b-2 border-ink pb-1 font-sans text-xs font-semibold uppercase tracking-[0.2em]">{month}</h2>
            <ul>
              {list.map((e) => (
                <li key={e.id} className="flex flex-col gap-2 border-b border-rule py-4 sm:flex-row sm:items-center sm:gap-6">
                  <div className="w-44 shrink-0 font-sans text-sm">
                    <p className="font-semibold">{formatEditionDate(e.editionDate, "short")}</p>
                    <p className="text-muted">Edition {e.revision} · {e.storyCount} stories{e.contentMode === "sample" ? " · sample" : ""}</p>
                  </div>
                  <Link href={`/newspaper/${e.id}`} className="headline flex-1 text-xl hover:text-accent hover:underline">
                    {e.leadTitle || "Untitled edition"}
                  </Link>
                  <a href={`/api/editions/${e.id}/pdf`} download className="btn btn-ghost !py-1.5 self-start sm:self-auto">
                    <Download size={15} aria-hidden /> PDF
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
