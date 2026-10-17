"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="kicker">Stop the presses</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold">Something went wrong.</h1>
      <p className="mt-3 text-ink-soft">This page couldn&apos;t be prepared. Your saved editions are safe.</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-6">Try again</button>
      {error.digest ? <p className="meta mt-4">Reference {error.digest}</p> : null}
    </div>
  );
}
