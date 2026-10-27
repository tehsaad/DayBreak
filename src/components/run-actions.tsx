"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, X } from "lucide-react";
import { api, ApiError } from "@/lib/client-api";

/** Retry (resume) or cancel a workflow run. */
export function RunActions({ runId, canRetry, canCancel }: { runId: string; canRetry: boolean; canCancel: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const act = (action: "retry" | "cancel") =>
    start(async () => {
      setMessage(null);
      try {
        await api(`/api/runs/${runId}/${action}`, { body: {} });
        router.refresh();
      } catch (err) {
        setMessage(err instanceof ApiError ? err.message : "Request failed.");
        router.refresh();
      }
    });
  if (!canRetry && !canCancel) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canRetry ? (
        <button type="button" className="btn btn-ghost !py-1 !text-xs" disabled={pending} onClick={() => act("retry")}>
          {pending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RotateCcw size={13} aria-hidden />} Retry
        </button>
      ) : null}
      {canCancel ? (
        <button type="button" className="btn btn-ghost !py-1 !text-xs" disabled={pending} onClick={() => act("cancel")}>
          <X size={13} aria-hidden /> Cancel
        </button>
      ) : null}
      {message ? <span role="alert" className="font-sans text-xs text-accent">{message}</span> : null}
    </div>
  );
}
