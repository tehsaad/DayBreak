"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Download, Search, X } from "lucide-react";
import type { Edition } from "@/lib/types";
import { BriefStory, LeadStory, SideStory, StandardStory, type StoryProps } from "./stories";
import { ThreeThings } from "./three-things";
import { RegenerateButton } from "./generate-button";
import { formatEditionDate, formatTime } from "./format";

interface Props {
  edition: Edition;
  savedIds: string[];
  isToday: boolean;
  isLatest: boolean;
  storageMode: "supabase" | "demo";
}

export function PaperView({ edition, savedIds, isToday, isLatest, storageMode }: Props) {
  const [saved, setSaved] = useState(() => new Set(savedIds));
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string | null>(null);
  const tz = edition.preferencesSnapshot.timezone || "UTC";

  const onSavedChange = useCallback((articleId: string, value: boolean) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (value) next.add(articleId);
      else next.delete(articleId);
      return next;
    });
  }, []);

  const onJump = useCallback((articleId: string) => {
    setQuery("");
    setSection(null);
    requestAnimationFrame(() => {
      const el = document.getElementById(`story-${articleId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const props = (position: number): StoryProps => {
    const story = edition.stories[position]!;
    return { editionId: edition.id, story, timeZone: tz, saved: saved.has(story.article.id), onSavedChange, onJump };
  };

  const filtering = query.trim().length > 0 || section !== null;
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const allowed = section ? new Set(edition.sections.find((s) => s.id === section)?.positions ?? []) : null;
    return edition.stories.filter(
      (s) => (!allowed || allowed.has(s.position)) && (!q || `${s.article.title} ${s.summary} ${s.article.publisher}`.toLowerCase().includes(q)),
    );
  }, [query, section, edition]);

  const lead = edition.stories[0];
  const top = edition.stories.filter((s) => s.tier === "top");
  const sections = edition.sections.filter((s) => s.id !== "front");

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      {/* Masthead */}
      <header className="pt-8 text-center sm:pt-10">
        <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-muted">
          {edition.readerName ? `${edition.readerName}'s morning paper` : "Your morning paper"}
        </p>
        <h1 className="mt-2 font-display text-[clamp(2.5rem,12.5vw,6rem)] font-extrabold leading-none tracking-[0.1em]">DAYBREAK</h1>
        <p className="mt-2 font-display text-lg italic text-muted">The world, filtered through you.</p>
        <div className="rule-double mt-5" />
        <div className="flex flex-col items-center justify-between gap-1 py-2 font-sans text-[0.72rem] uppercase tracking-[0.12em] text-ink-soft sm:flex-row">
          <span>{formatEditionDate(edition.editionDate)}</span>
          <span>
            Edition {edition.revision} · {edition.stories.length} stories · from {edition.ranking.candidateCount} articles
          </span>
          <span>{edition.ai.used ? `Edited with AI (${edition.ai.model})` : "No AI text in this edition"}</span>
        </div>
        <div className="border-b border-ink" />
      </header>

      {/* Status banners */}
      <div className="mt-4 space-y-2 font-sans text-sm">
        {edition.contentMode === "sample" ? (
          <p role="note" className="border border-warn/40 bg-warn-soft px-3 py-2 text-warn">
            <strong>Sample edition.</strong> Live feeds were unavailable, so this paper uses clearly labelled demonstration items — not real news.
          </p>
        ) : null}
        {!isToday ? (
          <p role="note" className="flex flex-wrap items-center justify-between gap-2 border border-rule bg-paper-card px-3 py-2 text-ink-soft">
            <span>You&apos;re reading the saved edition of {formatEditionDate(edition.editionDate)}. It is shown exactly as it was published.</span>
            {isLatest ? <Link href="/newspaper?new=1" className="font-semibold text-accent underline">Prepare today&apos;s paper</Link> : null}
          </p>
        ) : null}
        {edition.ai.note && !edition.ai.used ? <p className="text-xs text-muted">{edition.ai.note}</p> : null}
        {storageMode === "demo" ? (
          <p className="text-xs text-muted">Demo mode: this edition is stored on this server only and isn&apos;t synced to other devices.</p>
        ) : null}
      </div>

      {/* Toolbar */}
      <div className="no-print mt-5 flex flex-col gap-3 border-y border-rule py-3 lg:flex-row lg:items-center">
        <label className="relative flex-1 lg:max-w-xs">
          <span className="sr-only">Search this edition</span>
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this edition" className="input !pl-9" />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by section">
          {sections.map((s) => (
            <button key={s.id} type="button" className="chip !py-1 !text-xs" aria-pressed={section === s.id} onClick={() => setSection(section === s.id ? null : s.id)}>
              {s.title}
            </button>
          ))}
          {filtering ? (
            <button type="button" className="chip !py-1 !text-xs" onClick={() => { setQuery(""); setSection(null); }}>
              <X size={12} aria-hidden /> Clear
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          <a className="btn btn-ghost !py-1.5" href={`/api/editions/${edition.id}/pdf`} download>
            <Download size={15} aria-hidden /> PDF
          </a>
          <Link className="btn btn-ghost !py-1.5" href="/archive">
            <Archive size={15} aria-hidden /> Archive
          </Link>
          {isToday && isLatest ? <RegenerateButton /> : null}
        </div>
      </div>

      {filtering ? (
        <section aria-label="Search results" className="mt-6">
          <p className="font-sans text-sm text-muted" aria-live="polite">
            {results.length} {results.length === 1 ? "story" : "stories"} match{results.length === 1 ? "es" : ""}.
          </p>
          <div className="mt-3 grid gap-x-8 md:grid-cols-2">
            {results.map((s) => (
              <StandardStory key={s.position} {...props(s.position)} />
            ))}
          </div>
          {results.length === 0 ? <p className="mt-6 italic text-muted">Nothing in today&apos;s edition matches. Try <Link className="underline" href={`/explore?q=${encodeURIComponent(query)}`}>searching all recent reporting</Link>.</p> : null}
        </section>
      ) : (
        <>
          {/* Editor's note */}
          <section className="mx-auto mt-7 max-w-3xl text-center" aria-label="Editor's note">
            <p className="font-display text-xl italic leading-relaxed text-ink-soft sm:text-2xl">{edition.intro}</p>
            <p className="meta mt-2">{edition.introSource === "ai" ? "Editor's note written by AI from today's stories" : "Editor's note"}</p>
          </section>

          {/* Front page */}
          {lead ? (
            <section aria-label="Front page" className="mt-8 grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-8 lg:border-r lg:border-rule lg:pr-8">
                <LeadStory {...props(0)} />
              </div>
              <aside aria-label="Top stories" className="space-y-5 lg:col-span-4">
                <h2 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted">Also on the front page</h2>
                {top.map((s) => (
                  <SideStory key={s.position} {...props(s.position)} />
                ))}
              </aside>
            </section>
          ) : null}

          {edition.threeThings.length ? <ThreeThings items={edition.threeThings} stories={edition.stories} onJump={onJump} /> : null}

          {sections.map((sec) => {
            const standard = sec.positions.filter((p) => edition.stories[p]?.tier !== "brief");
            const briefs = sec.positions.filter((p) => edition.stories[p]?.tier === "brief");
            return (
              <section key={sec.id} aria-labelledby={`sec-${sec.id}`} className="mt-12">
                <div className="flex items-end justify-between border-b-2 border-ink pb-1.5">
                  <h2 id={`sec-${sec.id}`} className="font-display text-3xl font-extrabold tracking-tight">{sec.title}</h2>
                  <span className="meta">{sec.positions.length} {sec.positions.length === 1 ? "story" : "stories"}</span>
                </div>
                {sec.id === "broaden" ? <p className="mt-2 font-sans text-sm text-muted">Strong stories from outside the sections you follow, so your paper doesn&apos;t become an echo chamber.</p> : null}
                <div className="mt-4 grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
                  {standard.map((p) => (
                    <StandardStory key={p} {...props(p)} />
                  ))}
                  {briefs.length ? (
                    <div className={standard.length ? "" : "md:col-span-2 lg:col-span-3"}>
                      <h3 className="kicker !text-muted">In brief</h3>
                      {briefs.map((p) => (
                        <BriefStory key={p} {...props(p)} />
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}

          {/* About this edition */}
          <section aria-labelledby="about-edition" className="mt-14 border-t border-rule pt-5 font-sans text-xs leading-relaxed text-muted">
            <h2 id="about-edition" className="font-semibold uppercase tracking-[0.15em] text-ink-soft">About this edition</h2>
            <p className="mt-2 max-w-4xl">
              Prepared {formatTime(edition.createdAt, tz)} from {edition.ranking.candidateCount} recent articles. Ranked by DAYBREAK&apos;s transparent scoring ({edition.ranking.version}): your sections and interests, region, freshness, coverage by multiple publishers and topic diversity
              {edition.ranking.feedbackSignals ? `, plus ${edition.ranking.feedbackSignals} feedback signals you've given` : ""}. Each story links to its original publisher; DAYBREAK shows only headlines and short excerpts.{" "}
              <Link href="/settings#interests" className="underline">See and edit what DAYBREAK has learned</Link>.
            </p>
            <p className="mt-1">Edition ID {edition.id}</p>
          </section>
        </>
      )}
    </div>
  );
}
