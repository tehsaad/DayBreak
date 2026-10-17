"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/client-api";
import { safeLinkUrl } from "@/lib/security/url";
import { TOPICS, topicLabel } from "@/lib/topics";
import { displayExcerpt } from "@/lib/news/rights";
import { Thumb } from "../thumb";
import type { EditionStory } from "@/lib/types";
import { BiggerPicturePanel } from "./bigger-picture";
import { formatTime } from "./format";
import { HiddenNotice, StoryActions, type HiddenState } from "./story-actions";

export interface StoryProps {
  editionId: string;
  story: EditionStory;
  timeZone: string;
  saved: boolean;
  onSavedChange: (articleId: string, saved: boolean) => void;
  onJump?: (articleId: string) => void;
}

/** Records a (weak) "open" signal; keepalive lets it finish while the new tab opens. */
function recordOpen(editionId: string, articleId: string) {
  void api("/api/feedback", { body: { type: "open", editionId, articleId }, keepalive: true }).catch(() => undefined);
}

function SourceLink({ editionId, story, className = "" }: { editionId: string; story: EditionStory; className?: string }) {
  const href = safeLinkUrl(story.article.url);
  if (!href) return null;
  return (
    <>
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => recordOpen(editionId, story.article.id)}
      className={`no-print inline-flex items-center gap-1 font-sans text-xs font-semibold text-accent hover:underline ${className}`}
    >
      {story.article.sample ? "About this sample item" : `Read at ${story.article.publisher}`}
      <ArrowUpRight size={13} aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
    {!story.article.sample ? (
      <Link href={`/story/${story.article.id}`} className="no-print ml-4 inline-flex items-center gap-1 font-sans text-xs font-semibold text-ink underline-offset-2 hover:underline">
        Full coverage
      </Link>
    ) : null}
    </>
  );
}

export function StoryMeta({ story, timeZone }: { story: EditionStory; timeZone: string }) {
  const a = story.article;
  return (
    <p className="meta mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="font-semibold text-ink-soft">{a.publisher}</span>
      <span aria-hidden>·</span>
      <time dateTime={a.publishedAt ?? undefined}>{formatTime(a.publishedAt, timeZone)}</time>
      {a.sample ? <span className="rounded-sm bg-warn-soft px-1.5 py-px font-semibold text-warn">Sample</span> : null}
      {story.alsoReportedBy.length ? (
        <span className="text-muted">
          · Also reported by{" "}
          {story.alsoReportedBy.map((r, i) => (
            <span key={r.articleId}>
              {i ? ", " : ""}
              {safeLinkUrl(r.url) ? (
                <a className="underline decoration-rule hover:decoration-ink" href={safeLinkUrl(r.url)!} target="_blank" rel="noopener noreferrer">
                  {r.publisher}
                </a>
              ) : (
                r.publisher
              )}
            </span>
          ))}
        </span>
      ) : null}
    </p>
  );
}

function SummaryLabel({ story }: { story: EditionStory }) {
  return (
    <span className="sr-only">{story.summarySource === "ai" ? "AI summary of the report:" : "Publisher's description:"}</span>
  );
}

/** Lead image: large, loaded eagerly (it is the page's main image), with publisher credit. */
function LeadImage({ story }: { story: EditionStory }) {
  return (
    <figure className="mb-3">
      <Thumb src={story.article.imageUrl} alt={story.article.title} size="lead" priority label={TOPICS[story.article.topics[0] ?? "world"].short} className="max-h-[460px]" />
      {story.article.imageUrl ? <figcaption className="meta mt-1">Image: {story.article.publisher}</figcaption> : null}
    </figure>
  );
}

/** Publisher text is limited to one short sentence everywhere, including older editions. */
const shownSummary = (story: EditionStory) => (story.summarySource === "source" ? displayExcerpt(story.summary, story.article.sourceId) : story.summary);

const thumbLabel = (story: EditionStory) => TOPICS[story.article.topics[0] ?? "world"].short;

function useHidden() {
  return useState<HiddenState>(null);
}

export function LeadStory(props: StoryProps) {
  const { story, editionId, timeZone } = props;
  const [hidden, setHidden] = useHidden();
  if (hidden) return <HiddenNotice state={hidden} articleId={story.article.id} onUndo={() => setHidden(null)} />;
  return (
    <article id={`story-${story.article.id}`} className="animate-fade-up scroll-mt-24" aria-labelledby={`h-${story.article.id}`}>
      <p className="kicker">Lead story · {topicLabel(story.article.topics[0] ?? "world")}</p>
      <h2 id={`h-${story.article.id}`} className="headline mt-2 text-[2.1rem] sm:text-5xl lg:text-[3.4rem]">
        {story.article.title}
      </h2>
      <StoryMeta story={story} timeZone={timeZone} />
      <div className="mt-4">
        <LeadImage story={story} />
      </div>
      <p className="text-lg leading-relaxed text-ink-soft sm:text-xl">
        <SummaryLabel story={story} />
        {shownSummary(story) || "The publisher's feed did not include a description for this story."}
      </p>
      {story.whyItMatters ? <p className="mt-3 border-l-2 border-accent pl-3 italic text-ink-soft">{story.whyItMatters}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SourceLink editionId={editionId} story={story} />
        {story.summarySource === "ai" ? <span className="meta">AI summary</span> : <span className="meta">Publisher&apos;s description</span>}
      </div>
      <StoryActions editionId={editionId} story={story} saved={props.saved} onSavedChange={(v) => props.onSavedChange(story.article.id, v)} onHide={setHidden} />
      <BiggerPicturePanel editionId={editionId} position={story.position} initial={story.biggerPicture} defaultOpen onJump={props.onJump} />
    </article>
  );
}

export function SideStory(props: StoryProps) {
  const { story, editionId, timeZone } = props;
  const [hidden, setHidden] = useHidden();
  if (hidden) return <HiddenNotice state={hidden} articleId={story.article.id} onUndo={() => setHidden(null)} />;
  return (
    <article id={`story-${story.article.id}`} className="group scroll-mt-24 border-b border-rule pb-5 last:border-0" aria-labelledby={`h-${story.article.id}`}>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className="kicker">{topicLabel(story.article.topics[0] ?? "world")}</p>
          <h3 id={`h-${story.article.id}`} className="headline mt-1.5 text-[1.35rem]">{story.article.title}</h3>
        </div>
        <Thumb src={story.article.imageUrl} alt={story.article.title} size="thumb" label={thumbLabel(story)} className="mt-1" />
      </div>
      <StoryMeta story={story} timeZone={timeZone} />
      <p className="mt-2 leading-relaxed text-ink-soft">
        <SummaryLabel story={story} />
        {shownSummary(story)}
      </p>
      <SourceLink editionId={editionId} story={story} className="mt-2" />
      <StoryActions editionId={editionId} story={story} saved={props.saved} onSavedChange={(v) => props.onSavedChange(story.article.id, v)} onHide={setHidden} compact />
      {story.biggerPicture || story.tier === "top" ? (
        <BiggerPicturePanel editionId={editionId} position={story.position} initial={story.biggerPicture} onJump={props.onJump} />
      ) : null}
    </article>
  );
}

export function StandardStory(props: StoryProps) {
  const { story, editionId, timeZone } = props;
  const [hidden, setHidden] = useHidden();
  if (hidden) return <HiddenNotice state={hidden} articleId={story.article.id} onUndo={() => setHidden(null)} />;
  return (
    <article id={`story-${story.article.id}`} className="group scroll-mt-24 border-t border-rule pt-4" aria-labelledby={`h-${story.article.id}`}>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className="kicker">{topicLabel(story.article.topics[0] ?? "world")}</p>
          <h3 id={`h-${story.article.id}`} className="headline mt-1.5 text-[1.3rem]">{story.article.title}</h3>
        </div>
        <Thumb src={story.article.imageUrl} alt={story.article.title} size="thumb" label={thumbLabel(story)} className="mt-1" />
      </div>
      <StoryMeta story={story} timeZone={timeZone} />
      <p className="mt-2 leading-relaxed text-ink-soft">
        <SummaryLabel story={story} />
        {shownSummary(story)}
      </p>
      {story.whyItMatters ? <p className="mt-2 text-sm italic text-muted">{story.whyItMatters}</p> : null}
      <SourceLink editionId={editionId} story={story} className="mt-2" />
      <StoryActions editionId={editionId} story={story} saved={props.saved} onSavedChange={(v) => props.onSavedChange(story.article.id, v)} onHide={setHidden} compact />
      <BiggerPicturePanel editionId={editionId} position={story.position} initial={story.biggerPicture} onJump={props.onJump} />
    </article>
  );
}

export function BriefStory(props: StoryProps) {
  const { story, editionId, timeZone } = props;
  const [hidden, setHidden] = useHidden();
  if (hidden) return <HiddenNotice state={hidden} articleId={story.article.id} onUndo={() => setHidden(null)} />;
  return (
    <article id={`story-${story.article.id}`} className="group scroll-mt-24 border-t border-rule py-3" aria-labelledby={`h-${story.article.id}`}>
      <div className="flex gap-3">
        <Thumb src={story.article.imageUrl} alt={story.article.title} size="small" label={thumbLabel(story)} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 id={`h-${story.article.id}`} className="headline text-lg">{story.article.title}</h3>
          <StoryMeta story={story} timeZone={timeZone} />
        </div>
      </div>
      {shownSummary(story) ? <p className="mt-1 line-clamp-3 text-[0.95rem] leading-relaxed text-ink-soft">{shownSummary(story)}</p> : null}
      <SourceLink editionId={editionId} story={story} className="mt-1.5" />
      <StoryActions editionId={editionId} story={story} saved={props.saved} onSavedChange={(v) => props.onSavedChange(story.article.id, v)} onHide={setHidden} compact />
    </article>
  );
}
