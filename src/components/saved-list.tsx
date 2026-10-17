"use client";

import { displayExcerpt } from "@/lib/news/rights";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, Trash2 } from "lucide-react";
import { api } from "@/lib/client-api";
import { safeLinkUrl } from "@/lib/security/url";
import { TOPICS, topicLabel } from "@/lib/topics";
import { Thumb } from "./thumb";
import type { Bookmark } from "@/lib/types";
import { formatTime } from "./paper/format";

export function SavedList({ bookmarks, timeZone }: { bookmarks: Bookmark[]; timeZone: string }) {
  const [items, setItems] = useState(bookmarks);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const remove = (articleId: string) =>
    start(async () => {
      const prev = items;
      setItems((list) => list.filter((b) => b.articleId !== articleId));
      try {
        await api("/api/bookmarks", { method: "DELETE", body: { articleId } });
      } catch {
        setItems(prev);
        setError("Couldn't remove that story. Please try again.");
      }
    });
  return (
    <>
      {error ? <p role="alert" className="mt-4 font-sans text-sm text-accent">{error}</p> : null}
      <ul className="mt-8">
        {items.map((b) => {
          const href = safeLinkUrl(b.article.url);
          return (
            <li key={b.articleId} className="group border-t border-rule py-5">
              <div className="flex gap-4">
                <div className="min-w-0 flex-1">
                  <p className="kicker">{topicLabel(b.article.topics[0] ?? "world")}</p>
                  <h2 className="headline mt-1 text-2xl">{b.article.title}</h2>
                </div>
                <Thumb src={b.article.imageUrl} alt={b.article.title} size="thumb" label={TOPICS[b.article.topics[0] ?? "world"].short} />
              </div>
              <p className="meta mt-1">
                {b.article.publisher} · {formatTime(b.article.publishedAt, timeZone)} · saved {formatTime(b.savedAt, timeZone)}
              </p>
              {displayExcerpt(b.article.excerpt) ? <p className="mt-2 line-clamp-3 text-ink-soft">{displayExcerpt(b.article.excerpt)}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-4 font-sans text-xs">
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                    Read at {b.article.publisher} <ArrowUpRight size={13} aria-hidden />
                  </a>
                ) : null}
                {b.editionId ? <Link href={`/newspaper/${b.editionId}`} className="text-muted underline">From this edition</Link> : null}
                <button type="button" onClick={() => remove(b.articleId)} disabled={pending} className="inline-flex items-center gap-1 text-muted hover:text-accent">
                  <Trash2 size={13} aria-hidden /> Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
