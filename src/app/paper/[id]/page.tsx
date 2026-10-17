import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaperView } from "@/components/paper/paper-view";
import { editionDateFor } from "@/lib/preferences";
import { requireReader } from "@/lib/server/page-reader";
import { storageMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/paper/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edition ${id.slice(0, 8)}`, robots: { index: false } };
}

/** A saved edition, rendered exactly as stored — never regenerated. */
export default async function EditionPage({ params }: PageProps<"/paper/[id]">) {
  const { id } = await params;
  const { reader, prefs } = await requireReader(`/paper/${id}`);
  const edition = await reader.store.getEdition(reader.userId, id);
  if (!edition) notFound();
  const [latest, bookmarks] = await Promise.all([reader.store.latestEdition(reader.userId), reader.store.listBookmarks(reader.userId)]);
  const isToday = edition.editionDate === editionDateFor(prefs.timezone);
  return (
    <PaperView edition={edition} savedIds={bookmarks.map((b) => b.articleId)} isToday={isToday} isLatest={latest?.id === edition.id} storageMode={storageMode()} />
  );
}
