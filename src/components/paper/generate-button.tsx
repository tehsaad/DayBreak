"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/client-api";

const STEPS = ["Checking the latest reporting from your sources…", "Ranking stories for you…", "Arranging your front page…", "Writing summaries and the Bigger Picture…", "Saving your edition…"];

function Progress({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3200);
    return () => clearInterval(t);
  }, [active]);
  if (!active) return null;
  return (
    <p className="font-sans text-sm text-muted" aria-live="polite">
      {STEPS[step]}
    </p>
  );
}

interface GenerateResponse {
  editionId: string;
  created: boolean;
}

/** "Generate my paper": creates today's edition if it doesn't exist yet. */
export function GenerateButton({ label = "Generate my paper" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = () =>
    start(async () => {
      setError(null);
      try {
        const res = await api<GenerateResponse>("/api/editions", { body: { mode: "ensure" } });
        router.push(`/newspaper/${res.editionId}`);
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409 && typeof err.data.next === "string") router.push(err.data.next);
        else setError(err instanceof ApiError ? err.message : "Something went wrong.");
      }
    });
  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" className="btn btn-primary !px-6 !py-3 !text-base" onClick={go} disabled={pending}>
        <Sparkles size={18} aria-hidden className={pending ? "animate-pulse" : ""} />
        {pending ? "Preparing your paper…" : label}
      </button>
      <Progress active={pending} />
      {error ? <p role="alert" className="font-sans text-sm text-accent">{error}</p> : null}
    </div>
  );
}

/** Regenerate today's paper as a new revision (previous revisions stay in the archive). */
export function RegenerateButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = () =>
    start(async () => {
      setError(null);
      try {
        const res = await api<GenerateResponse>("/api/editions", { body: { mode: "regenerate" } });
        router.push(`/newspaper/${res.editionId}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Something went wrong.");
      }
    });
  return (
    <div className="flex flex-col items-end">
      <button type="button" className="btn btn-primary !py-1.5" onClick={go} disabled={pending} title="Re-rank with your latest feedback. The current edition stays in your archive.">
        <RefreshCw size={15} aria-hidden className={pending ? "animate-spin" : ""} />
        {pending ? "Re-ranking…" : "Regenerate"}
      </button>
      {error ? <p role="alert" className="mt-1 max-w-56 text-right font-sans text-xs text-accent">{error}</p> : null}
    </div>
  );
}
