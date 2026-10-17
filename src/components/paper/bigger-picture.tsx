"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Telescope } from "lucide-react";
import { api, ApiError } from "@/lib/client-api";
import type { BiggerPicture as BP } from "@/lib/types";
import { formatEditionDate } from "./format";

function Block({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "interpretation" }) {
  return (
    <div>
      <dt className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
        {tone === "interpretation" ? <span className="ml-1.5 rounded-sm bg-warn-soft px-1 py-px normal-case tracking-normal text-warn">interpretation</span> : null}
      </dt>
      <dd className="mt-0.5 text-[0.95rem] leading-relaxed text-ink-soft">{children}</dd>
    </div>
  );
}

export function BiggerPictureContent({ bp, onJump }: { bp: BP; onJump?: (articleId: string) => void }) {
  return (
    <div className="space-y-3">
      <dl className="space-y-3">
        <Block label="What happened">{bp.whatHappened}</Block>
        {bp.whyItMatters ? <Block label="Why it matters">{bp.whyItMatters}</Block> : null}
        {bp.background ? <Block label="Background">{bp.background}</Block> : null}
        {bp.connections.length ? (
          <Block label="Connections in today's edition">
            <ul className="space-y-1">
              {bp.connections.map((c) => (
                <li key={c.articleId}>
                  {onJump ? (
                    <button type="button" className="text-left font-semibold text-ink underline decoration-rule underline-offset-2 hover:decoration-ink" onClick={() => onJump(c.articleId)}>
                      {c.title}
                    </button>
                  ) : (
                    <span className="font-semibold text-ink">{c.title}</span>
                  )}{" "}
                  — {c.relation}
                </li>
              ))}
            </ul>
          </Block>
        ) : null}
        {bp.whatChanged ? <Block label="Compared with your earlier editions">{bp.whatChanged}</Block> : null}
        {bp.earlierCoverage.length && !bp.whatChanged ? (
          <Block label="Earlier in your editions">
            <ul>
              {bp.earlierCoverage.map((e) => (
                <li key={e.editionId + e.title}>
                  {formatEditionDate(e.editionDate, "short")}: <a href={e.url} className="underline" target="_blank" rel="noopener noreferrer">{e.title}</a> ({e.publisher})
                </li>
              ))}
            </ul>
          </Block>
        ) : null}
        {bp.watchNext ? <Block label="What to watch" tone="interpretation">{bp.watchNext}</Block> : null}
        <Block label="A question worth asking"><em>{bp.question}</em></Block>
      </dl>
      <p className="border-t border-rule pt-2 font-sans text-[0.7rem] text-muted">
        {bp.source === "ai" ? "Written by AI from the cited reporting and your saved editions; checked so it cites no figures absent from the sources." : "Assembled from the publisher's description and your saved editions — no AI-generated text."}
        {bp.insufficient ? " The source gives limited detail, so read the original before drawing conclusions." : ""}
        {bp.evidence.length ? (
          <>
            {" "}Evidence:{" "}
            {bp.evidence.map((e, i) => (
              <span key={e.articleId}>
                {i ? ", " : ""}
                <a className="underline" href={e.url} target="_blank" rel="noopener noreferrer">{e.publisher}</a>
              </span>
            ))}
          </>
        ) : null}
      </p>
    </div>
  );
}

/** Collapsible Bigger Picture panel; fetches (and persists) the analysis on first open if needed. */
export function BiggerPicturePanel({ editionId, position, initial, defaultOpen, onJump }: { editionId: string; position: number; initial: BP | null; defaultOpen?: boolean; onJump?: (articleId: string) => void }) {
  const [open, setOpen] = useState(Boolean(defaultOpen && initial));
  const [bp, setBp] = useState<BP | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !bp) {
      start(async () => {
        setError(null);
        try {
          const res = await api<{ biggerPicture: BP }>(`/api/editions/${editionId}/bigger-picture`, { body: { position } });
          setBp(res.biggerPicture);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Unavailable right now.");
        }
      });
    }
  };

  return (
    <section className="mt-4 border-t-2 border-ink" aria-label="The Bigger Picture">
      <button type="button" onClick={toggle} aria-expanded={open} className="no-print flex w-full items-center justify-between gap-2 py-2 text-left">
        <span className="flex items-center gap-2 font-display text-lg font-bold">
          <Telescope size={18} aria-hidden className="text-accent" /> The Bigger Picture
        </span>
        <ChevronDown size={18} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="bg-paper-deep/60 px-4 py-4 animate-fade-up">
          {pending && !bp ? (
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              <p className="font-sans text-xs text-muted">Connecting this story to today&apos;s edition and your archive…</p>
              <div className="skeleton h-3 w-11/12" />
              <div className="skeleton h-3 w-9/12" />
              <div className="skeleton h-3 w-10/12" />
            </div>
          ) : error ? (
            <p role="alert" className="font-sans text-sm text-accent">{error}</p>
          ) : bp ? (
            <BiggerPictureContent bp={bp} onJump={onJump} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
