import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };
export const dynamic = "force-static";

/** Static page shown by the service worker when there's no connection. Contains no reader data. */
export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto max-w-xl flex-1 px-4 py-24 text-center">
      <p className="font-display text-4xl font-extrabold tracking-[0.12em]">DAYBREAK</p>
      <div className="rule-double mx-auto mt-4 max-w-xs" />
      <h1 className="mt-8 font-display text-3xl font-bold">You&apos;re offline</h1>
      <p className="mt-3 text-ink-soft">Your paper needs a connection to load — DAYBREAK doesn&apos;t keep copies of private editions on your device. Reconnect and try again.</p>
      {/* A full page load (not client navigation) so the browser really retries the network. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/newspaper" className="btn btn-primary mt-6">Try again</a>
    </main>
  );
}
