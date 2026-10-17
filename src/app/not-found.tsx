import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="kicker">404</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold">That page isn&apos;t in this edition.</h1>
      <p className="mt-3 text-ink-soft">It may have been removed, or it belongs to someone else&apos;s paper.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/paper" className="btn btn-primary">Today&apos;s paper</Link>
        <Link href="/archive" className="btn btn-ghost">Archive</Link>
      </div>
    </div>
  );
}
