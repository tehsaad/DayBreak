"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/client-api";
import { publishers } from "@/lib/news/sources";
import { GLOBAL_REGION, INTERESTS, REGIONS, TOPICS, TOPIC_IDS, type TopicId } from "@/lib/topics";
import type { Depth, ReaderPreferences } from "@/lib/types";

export type Draft = Pick<
  ReaderPreferences,
  "displayName" | "sections" | "interests" | "region" | "localBalance" | "depth" | "mutedTopics" | "excludedSources" | "mutedKeywords" | "readingMinutes" | "timezone"
>;

export function draftFrom(p: ReaderPreferences | null): Draft {
  return {
    displayName: p?.displayName ?? "",
    sections: p?.sections ?? ["world", "ai-tech", "science"],
    interests: p?.interests ?? [],
    region: p?.region ?? "PK",
    localBalance: p?.localBalance ?? 0.5,
    depth: p?.depth ?? "balanced",
    mutedTopics: p?.mutedTopics ?? [],
    excludedSources: p?.excludedSources ?? [],
    mutedKeywords: p?.mutedKeywords ?? [],
    readingMinutes: p?.readingMinutes ?? 15,
    timezone: p?.timezone ?? "UTC",
  };
}

const DEPTHS: { id: Depth; title: string; body: string }[] = [
  { id: "brief", title: "Brief", body: "About 8 stories with one-paragraph summaries. A ten-minute read." },
  { id: "balanced", title: "Balanced", body: "About 12 stories with fuller summaries and context." },
  { id: "deep", title: "Deep", body: "Up to 16 stories, longer summaries and more analysis." },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// ---------------------------------------------------------------------------
// Field groups (shared by onboarding steps and the settings page)
// ---------------------------------------------------------------------------

export function SectionsField({ draft, set }: { draft: Draft; set: (d: Partial<Draft>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {TOPIC_IDS.map((id) => {
        const t = TOPICS[id];
        const on = draft.sections.includes(id);
        const muted = draft.mutedTopics.includes(id);
        return (
          <button
            key={id}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={muted}
            onClick={() => set({ sections: toggle(draft.sections, id), interests: on ? draft.interests.filter((i) => INTERESTS.find((x) => x.id === i)?.topic !== id) : draft.interests })}
            className={`group flex items-start gap-3 border p-4 text-left transition-colors ${on ? "border-ink bg-ink text-paper" : "border-rule bg-paper-card hover:border-ink"} disabled:opacity-40`}
          >
            <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center border ${on ? "border-paper bg-paper text-ink" : "border-muted"}`} aria-hidden>
              {on ? <Check size={12} strokeWidth={3} /> : null}
            </span>
            <span>
              <span className="block font-display text-lg font-bold leading-tight">{t.label}</span>
              <span className={`mt-0.5 block font-sans text-xs ${on ? "text-paper/80" : "text-muted"}`}>{muted ? "Muted — unmute it below to follow" : t.blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function InterestsField({ draft, set }: { draft: Draft; set: (d: Partial<Draft>) => void }) {
  const groups = TOPIC_IDS.filter((t) => !draft.mutedTopics.includes(t)).map((t) => ({ topic: t, items: INTERESTS.filter((i) => i.topic === t) }));
  const ordered = [...groups.filter((g) => draft.sections.includes(g.topic)), ...groups.filter((g) => !draft.sections.includes(g.topic))];
  return (
    <div className="space-y-5">
      {ordered.map((g) => (
        <fieldset key={g.topic}>
          <legend className="field-label">
            {TOPICS[g.topic].label}
            {!draft.sections.includes(g.topic) ? <span className="ml-2 font-normal text-muted">(choosing one also follows this section)</span> : null}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {g.items.map((i) => (
              <button
                key={i.id}
                type="button"
                className="chip"
                aria-pressed={draft.interests.includes(i.id)}
                onClick={() => {
                  const interests = toggle(draft.interests, i.id);
                  const sections = interests.includes(i.id) && !draft.sections.includes(i.topic) ? [...draft.sections, i.topic] : draft.sections;
                  set({ interests, sections });
                }}
              >
                {i.label}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function RegionField({ draft, set }: { draft: Draft; set: (d: Partial<Draft>) => void }) {
  const regionName = REGIONS.find((r) => r.code === draft.region)?.name;
  const pct = Math.round(draft.localBalance * 100);
  return (
    <div className="space-y-6">
      <label className="block">
        <span className="field-label">Where are you reading from?</span>
        <select className="input mt-1.5" value={draft.region} onChange={(e) => set({ region: e.target.value })}>
          {REGIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
          <option value={GLOBAL_REGION}>Nowhere in particular — international only</option>
        </select>
      </label>
      {draft.region !== GLOBAL_REGION ? (
        <label className="block">
          <span className="field-label">Local versus international coverage</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            onChange={(e) => set({ localBalance: Number(e.target.value) / 100 })}
            className="mt-3 w-full accent-[var(--color-accent)]"
            aria-valuetext={`${pct}% local`}
          />
          <span className="mt-1 flex justify-between font-sans text-xs text-muted">
            <span>Mostly international</span>
            <span className="font-semibold text-ink">{pct}% weight on {regionName}</span>
            <span>Mostly local</span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

export function DepthField({ draft, set }: { draft: Draft; set: (d: Partial<Draft>) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Reading depth">
        {DEPTHS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={draft.depth === d.id}
            onClick={() => set({ depth: d.id })}
            className={`border p-4 text-left transition-colors ${draft.depth === d.id ? "border-ink bg-ink text-paper" : "border-rule bg-paper-card hover:border-ink"}`}
          >
            <span className="block font-display text-xl font-bold">{d.title}</span>
            <span className={`mt-1 block font-sans text-xs ${draft.depth === d.id ? "text-paper/80" : "text-muted"}`}>{d.body}</span>
          </button>
        ))}
      </div>
      <label className="block">
        <span className="field-label">Daily reading time: {draft.readingMinutes} minutes</span>
        <input type="range" min={5} max={45} step={5} value={draft.readingMinutes} onChange={(e) => set({ readingMinutes: Number(e.target.value) })} className="mt-3 w-full accent-[var(--color-accent)]" />
        <span className="mt-1 block font-sans text-xs text-muted">DAYBREAK sizes the paper to fit — fewer stories when time is short.</span>
      </label>
    </div>
  );
}

export function FineTuneField({ draft, set }: { draft: Draft; set: (d: Partial<Draft>) => void }) {
  const [keyword, setKeyword] = useState("");
  const pubs = useMemo(() => publishers(), []);
  const addKeyword = () => {
    const k = keyword.trim().toLowerCase();
    if (k.length >= 2 && !draft.mutedKeywords.includes(k) && draft.mutedKeywords.length < 30) set({ mutedKeywords: [...draft.mutedKeywords, k] });
    setKeyword("");
  };
  return (
    <div className="space-y-7">
      <fieldset>
        <legend className="field-label">Mute topics you never want to see</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TOPIC_IDS.map((t) => (
            <button
              key={t}
              type="button"
              className="chip"
              aria-pressed={draft.mutedTopics.includes(t)}
              onClick={() => {
                const muted = toggle(draft.mutedTopics, t);
                set({ mutedTopics: muted, sections: draft.sections.filter((s) => !muted.includes(s)) });
              }}
            >
              {TOPICS[t].short}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="field-label">Leave out these publishers</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {pubs.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={draft.excludedSources.includes(p.id)} onClick={() => set({ excludedSources: toggle(draft.excludedSources, p.id) })}>
              {p.publisher}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="field-label" htmlFor="kw">Mute keywords</label>
        <div className="mt-1.5 flex gap-2">
          <input id="kw" className="input" value={keyword} maxLength={40} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())} placeholder="e.g. celebrity, transfer rumours" />
          <button type="button" className="btn btn-ghost" onClick={addKeyword}>Add</button>
        </div>
        {draft.mutedKeywords.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {draft.mutedKeywords.map((k) => (
              <li key={k}>
                <button type="button" className="chip" aria-pressed onClick={() => set({ mutedKeywords: draft.mutedKeywords.filter((x) => x !== k) })} aria-label={`Unmute ${k}`}>
                  {k} ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export async function savePreferences(draft: Draft) {
  return api<{ preferences: ReaderPreferences }>("/api/preferences", { method: "PUT", body: draft });
}

// ---------------------------------------------------------------------------
// Onboarding wizard
// ---------------------------------------------------------------------------

const STEPS = [
  { id: "welcome", title: "Welcome to DAYBREAK", lede: "A morning paper built around you. Six quick steps — everything can be changed later." },
  { id: "sections", title: "What should your paper cover?", lede: "Pick the sections you want every morning. Choose at least one." },
  { id: "interests", title: "Anything in particular?", lede: "Narrower interests sharpen the ranking. Optional, but it makes a real difference." },
  { id: "region", title: "Where in the world are you?", lede: "Used only to weigh local against international news." },
  { id: "depth", title: "How do you like to read?", lede: "Choose a depth and how much time you have." },
  { id: "finetune", title: "Anything to leave out?", lede: "Optional. Muted topics, publishers and keywords never appear." },
  { id: "review", title: "Ready to print", lede: "Here's the paper you've designed." },
] as const;

export function OnboardingWizard({ initial, mode }: { initial: ReaderPreferences | null; mode: "supabase" | "demo" }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => {
    const d = draftFrom(initial);
    if (initial || typeof window === "undefined") return d;
    // New reader: start from the browser's time zone (and Pakistan for Asia/Karachi).
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz ? { ...d, timezone: tz, region: tz === "Asia/Karachi" ? "PK" : d.region } : d;
  });
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "printing">("idle");
  const [, start] = useTransition();
  const set = (d: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...d }));

  const current = STEPS[step]!;
  const canContinue = current.id !== "sections" || draft.sections.length > 0;

  const finish = () =>
    start(async () => {
      setError(null);
      try {
        setPhase("saving");
        await savePreferences(draft);
        setPhase("printing");
        const res = await api<{ editionId: string }>("/api/editions", { body: { mode: "ensure" } });
        router.push(`/paper/${res.editionId}`);
        router.refresh();
      } catch (err) {
        setPhase("idle");
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
    });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex items-center gap-3 font-sans text-xs text-muted">
        <span>
          Step {step + 1} of {STEPS.length}
        </span>
        <div className="h-1 flex-1 bg-paper-deep" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="Onboarding progress">
          <div className="h-full bg-accent transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div key={current.id} className="animate-fade-up">
        <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{current.title}</h1>
        <p className="mt-2 text-lg text-ink-soft">{current.lede}</p>

        <div className="mt-8">
          {current.id === "welcome" ? (
            <div className="space-y-6">
              <label className="block max-w-md">
                <span className="field-label">What should we call you? (optional)</span>
                <input className="input mt-1.5" value={draft.displayName} maxLength={40} onChange={(e) => set({ displayName: e.target.value })} placeholder="First name or nickname" autoComplete="given-name" />
              </label>
              <ul className="grid gap-4 border-t border-rule pt-6 font-sans text-sm text-ink-soft sm:grid-cols-3">
                <li><strong className="block font-display text-lg text-ink">Real reporting</strong>Headlines and excerpts from trusted publishers, always linked to the original.</li>
                <li><strong className="block font-display text-lg text-ink">Explained</strong>The Bigger Picture and Three Things to Remember help you understand, not just scroll.</li>
                <li><strong className="block font-display text-lg text-ink">Learns from you</strong>Save, skip or say “not interested” — tomorrow&apos;s paper adapts, and you can see exactly how.</li>
              </ul>
              {mode === "demo" ? (
                <p className="border border-warn/40 bg-warn-soft px-3 py-2 font-sans text-xs text-warn">
                  Demo mode: your profile is kept on this server only (no account, not synced across devices). Configure Supabase for real accounts.
                </p>
              ) : null}
            </div>
          ) : null}
          {current.id === "sections" ? <SectionsField draft={draft} set={set} /> : null}
          {current.id === "interests" ? <InterestsField draft={draft} set={set} /> : null}
          {current.id === "region" ? <RegionField draft={draft} set={set} /> : null}
          {current.id === "depth" ? <DepthField draft={draft} set={set} /> : null}
          {current.id === "finetune" ? <FineTuneField draft={draft} set={set} /> : null}
          {current.id === "review" ? <Review draft={draft} onEdit={setStep} /> : null}
        </div>
      </div>

      {error ? <p role="alert" className="mt-6 font-sans text-sm text-accent">{error}</p> : null}

      <div className="mt-10 flex items-center justify-between border-t border-rule pt-5">
        <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || phase !== "idle"}>
          <ArrowLeft size={16} aria-hidden /> Back
        </button>
        {current.id === "review" ? (
          <button type="button" className="btn btn-primary !px-5" onClick={finish} disabled={phase !== "idle"}>
            {phase === "idle" ? (
              <>Print my first paper <ArrowRight size={16} aria-hidden /></>
            ) : (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden /> {phase === "saving" ? "Saving your profile…" : "Gathering today's reporting…"}
              </>
            )}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={!canContinue}>
            {current.id === "interests" || current.id === "finetune" ? "Continue" : "Next"} <ArrowRight size={16} aria-hidden />
          </button>
        )}
      </div>
      {phase === "printing" ? <p className="mt-3 text-right font-sans text-xs text-muted" aria-live="polite">The first edition can take up to half a minute while feeds are fetched.</p> : null}
    </div>
  );
}

function Review({ draft, onEdit }: { draft: Draft; onEdit: (step: number) => void }) {
  const rows: { label: string; value: string; step: number }[] = [
    { label: "Name", value: draft.displayName || "—", step: 0 },
    { label: "Sections", value: draft.sections.map((s) => TOPICS[s as TopicId].label).join(", ") || "—", step: 1 },
    { label: "Interests", value: draft.interests.map((i) => INTERESTS.find((x) => x.id === i)?.label).filter(Boolean).join(", ") || "None chosen", step: 2 },
    {
      label: "Region",
      value: draft.region === GLOBAL_REGION ? "International only" : `${REGIONS.find((r) => r.code === draft.region)?.name} · ${Math.round(draft.localBalance * 100)}% local`,
      step: 3,
    },
    { label: "Depth", value: `${draft.depth[0]!.toUpperCase()}${draft.depth.slice(1)} · ${draft.readingMinutes} min`, step: 4 },
    { label: "Left out", value: [...draft.mutedTopics.map((t) => TOPICS[t as TopicId].short), ...draft.excludedSources, ...draft.mutedKeywords].join(", ") || "Nothing", step: 5 },
  ];
  return (
    <dl className="divide-y divide-rule border-y border-rule">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start gap-4 py-3">
          <dt className="w-24 shrink-0 font-sans text-xs font-semibold uppercase tracking-wider text-muted">{r.label}</dt>
          <dd className="flex-1">{r.value}</dd>
          <button type="button" className="font-sans text-xs text-accent underline" onClick={() => onEdit(r.step)}>
            Edit
          </button>
        </div>
      ))}
    </dl>
  );
}
