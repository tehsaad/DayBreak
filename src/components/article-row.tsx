"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight, Bookmark, BookmarkCheck, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { api, ApiError } from "@/lib/client-api";
import { safeLinkUrl } from "@/lib/security/url";
import { topicLabel } from "@/lib/topics";
import type { Article } from "@/lib/types";
import { formatTime } from "./paper/format";

export type RowArticle = Pick<Article, "id" | "url" | "title" | "description" | "publisher" | "publishedAt" | "topics" | "sample">;

/**
 * A story from the shared article store (Explore, Search) with feedback controls. Each control
 * persists a real signal; the server looks the article up itself, so nothing here is trusted.
 */
export function ArticleRow({ article, timeZone, saved: initiallySaved = false }: { article: RowArticle; timeZone: string; saved?: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [signal, setSignal] = useState<null | "more" | "less" | "hidden">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const href = safeLinkUrl(article.url);

  const run = (fn: () => Promise<unknown>, rollback: () => void) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (err) {
        rollback();
        setError(err instanceof ApiError ? err.message : "Couldn't save that. Please try again.");
      }
    });

  const toggleSave = () => {
    const next = !saved;
    setSaved(next);
    run(() => (next ? api("/api/bookmarks", { body: { articleId: article.id } }) : api("/api/bookmarks", { method: "DELETE", body: { articleId: article.id } })), () => setSaved(!next));
  };
  const rate = (value: 1 | 5) => {
    setSignal(value === 5 ? "more" : "less");
    run(() => api("/api/feedback", { body: { type: "rating", value, articleId: article.id } }), () => setSignal(null));
  };
  const hide = () => {
    setSignal("hidden");
    run(() => api("/api/feedback", { body: { type: "not_interested", articleId: article.id } }), () => setSignal(null));
  };
  const undoHide = () =>
    start(async () => {
      await api("/api/feedback", { method: "DELETE", body: { articleId: article.id, type: "not_interested" } }).catch(() => undefined);
      setSignal(null);
    });

  if (signal === "hidden") {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-rule py-3 font-sans text-xs text-muted">
        <span>Noted — you&apos;ll see fewer stories like “{article.title.slice(0, 60)}”.</span>
        <button type="button" className="font-semibold text-ink underline" onClick={undoHide} disabled={pending}>Undo</button>
      </li>
    );
  }

  const btn = "inline-flex items-center gap-1 rounded px-1.5 py-1 text-muted hover:bg-paper-deep hover:text-ink disabled:opacity-50";
  return (
    <li className="border-t border-rule py-3">
      <p className="kicker">{topicLabel(article.topics[0] ?? "world")}</p>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="headline mt-1 inline-flex items-start gap-1 text-lg hover:text-accent">
          {article.title} <ArrowUpRight size={14} className="mt-1.5 shrink-0" aria-hidden />
          <span className="sr-only">(opens {article.publisher} in a new tab)</span>
        </a>
      ) : (
        <p className="headline mt-1 text-lg">{article.title}</p>
      )}
      <p className="meta mt-1">
        {article.publisher} · {formatTime(article.publishedAt, timeZone)}
        {article.sample ? " · Sample" : ""}
      </p>
      {article.description ? <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{article.description}</p> : null}
      <div className="-ml-1.5 mt-1.5 flex flex-wrap items-center gap-0.5 font-sans text-xs">
        <button type="button" className={btn} onClick={toggleSave} aria-pressed={saved} disabled={pending}>
          {saved ? <BookmarkCheck size={14} className="text-forest" aria-hidden /> : <Bookmark size={14} aria-hidden />} {saved ? "Saved" : "Save"}
        </button>
        <button type="button" className={btn} onClick={() => rate(5)} aria-pressed={signal === "more"} disabled={pending || signal !== null}>
          <ThumbsUp size={14} aria-hidden className={signal === "more" ? "text-forest" : ""} /> {signal === "more" ? "Noted" : "More like this"}
        </button>
        <button type="button" className={btn} onClick={() => rate(1)} aria-pressed={signal === "less"} disabled={pending || signal !== null}>
          <ThumbsDown size={14} aria-hidden /> {signal === "less" ? "Noted" : "Less like this"}
        </button>
        <button type="button" className={btn} onClick={hide} disabled={pending}>
          <X size={14} aria-hidden /> Not interested
        </button>
      </div>
      {error ? <p role="alert" className="mt-1 font-sans text-xs text-accent">{error}</p> : null}
    </li>
  );
}

/** Explicit Follow / Following toggle for a topic. */
export function FollowTopicButton({ topic, label, following: initial }: { topic: string; label: string; following: boolean }) {
  const [following, setFollowing] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const next = !following;
      setFollowing(next);
      setError(null);
      try {
        await api("/api/topics", { body: { topic, follow: next } });
      } catch (err) {
        setFollowing(!next);
        setError(err instanceof ApiError ? err.message : "Couldn't update.");
      }
    });
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={toggle} disabled={pending} aria-pressed={following} className={`chip !py-1 !text-xs ${following ? "" : ""}`} aria-label={`${following ? "Unfollow" : "Follow"} ${label}`}>
        {following ? "Following ✓" : "+ Follow"}
      </button>
      {error ? <span role="alert" className="font-sans text-xs text-accent">{error}</span> : null}
    </span>
  );
}
