"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck, EyeOff, Info, ThumbsDown, ThumbsUp } from "lucide-react";
import { api, ApiError } from "@/lib/client-api";
import type { EditionStory } from "@/lib/types";

export type HiddenState = null | "skip" | "not_interested";

interface Props {
  editionId: string;
  story: EditionStory;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
  onHide: (state: HiddenState) => void;
  compact?: boolean;
}

/** Save, rate, hide and "why this story" controls. Every control persists a real signal. */
export function StoryActions({ editionId, story, saved, onSavedChange, onHide, compact }: Props) {
  const [showWhy, setShowWhy] = useState(false);
  const [liked, setLiked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const articleId = story.article.id;

  const run = (fn: () => Promise<unknown>, rollback?: () => void) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (err) {
        rollback?.();
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      }
    });

  const toggleSave = () => {
    const next = !saved;
    onSavedChange(next);
    run(
      () => (next ? api("/api/bookmarks", { body: { editionId, articleId } }) : api("/api/bookmarks", { method: "DELETE", body: { articleId } })),
      () => onSavedChange(!next),
    );
  };
  const like = () => {
    setLiked(true);
    run(() => api("/api/feedback", { body: { type: "rating", value: 5, editionId, articleId } }), () => setLiked(false));
  };
  const hide = (type: "skip" | "not_interested") => {
    onHide(type);
    run(() => api("/api/feedback", { body: { type, editionId, articleId } }), () => onHide(null));
  };

  const btn = "inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-muted transition-colors hover:bg-paper-deep hover:text-ink disabled:opacity-50";
  return (
    <div className="no-print mt-3 font-sans text-xs">
      <div className="flex flex-wrap items-center gap-0.5 -ml-2">
        <button type="button" className={btn} onClick={toggleSave} aria-pressed={saved} disabled={pending}>
          {saved ? <BookmarkCheck size={15} className="text-forest" aria-hidden /> : <Bookmark size={15} aria-hidden />}
          <span className={saved ? "text-forest" : ""}>{saved ? "Saved" : "Save"}</span>
        </button>
        <button type="button" className={btn} onClick={like} aria-pressed={liked} disabled={pending || liked} title="Show me more stories like this">
          <ThumbsUp size={15} aria-hidden className={liked ? "text-forest" : ""} />
          <span className={liked ? "text-forest" : ""}>{liked ? "Noted" : compact ? "More" : "More like this"}</span>
        </button>
        <button type="button" className={btn} onClick={() => hide("not_interested")} disabled={pending} title="Not interested: see fewer stories like this">
          <ThumbsDown size={15} aria-hidden />
          <span>{compact ? "Less" : "Not interested"}</span>
        </button>
        <button type="button" className={btn} onClick={() => hide("skip")} disabled={pending} title="Hide this story for now (a mild signal)">
          <EyeOff size={15} aria-hidden />
          <span>Skip</span>
        </button>
        {story.reasons.length ? (
          <button type="button" className={btn} onClick={() => setShowWhy((v) => !v)} aria-expanded={showWhy}>
            <Info size={15} aria-hidden />
            <span>Why this?</span>
          </button>
        ) : null}
      </div>
      {showWhy ? (
        <ul className="mt-1.5 space-y-0.5 border-l-2 border-accent/60 pl-3 text-ink-soft">
          {story.reasons.map((r) => (
            <li key={r.code}>{r.text}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p role="alert" className="mt-1 text-accent">{error}</p> : null}
    </div>
  );
}

/** Shown in place of a hidden story, with a real undo. */
export function HiddenNotice({ state, articleId, onUndo }: { state: Exclude<HiddenState, null>; articleId: string; onUndo: () => void }) {
  const [pending, start] = useTransition();
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2 border border-dashed border-rule px-3 py-2.5 font-sans text-xs text-muted animate-fade-up">
      <span>{state === "not_interested" ? "Noted — future editions will carry fewer stories like this." : "Skipped. It counts as a mild signal."}</span>
      <button
        type="button"
        className="font-semibold text-ink underline underline-offset-2"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await api("/api/feedback", { method: "DELETE", body: { articleId, type: state } }).catch(() => undefined);
            onUndo();
          })
        }
      >
        Undo
      </button>
    </div>
  );
}
