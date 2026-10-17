import type { Metadata } from "next";
import Link from "next/link";
import { SavedList } from "@/components/saved-list";
import { requireReader } from "@/lib/server/page-reader";

export const metadata: Metadata = { title: "Saved stories" };
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const { reader, prefs } = await requireReader("/saved");
  const bookmarks = await reader.store.listBookmarks(reader.userId);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold tracking-tight">Saved stories</h1>
      <p className="mt-2 text-ink-soft">Stories you&apos;ve kept for later. Saving also tells DAYBREAK you value this kind of reporting.</p>
      {bookmarks.length === 0 ? (
        <div className="mt-10 border border-dashed border-rule p-8 text-center">
          <p className="font-display text-2xl">Nothing saved yet.</p>
          <p className="mt-2 text-ink-soft">Use “Save” on any story in your paper.</p>
          <Link href="/newspaper" className="btn btn-primary mt-5">Open today&apos;s paper</Link>
        </div>
      ) : (
        <SavedList bookmarks={bookmarks} timeZone={prefs.timezone} />
      )}
    </div>
  );
}
