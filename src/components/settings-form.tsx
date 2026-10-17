"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/client-api";
import type { ReaderPreferences } from "@/lib/types";
import { DepthField, FineTuneField, InterestsField, RegionField, SectionsField, draftFrom, savePreferences, type Draft } from "./preferences-editor";

function Group({ id, title, lede, children }: { id: string; title: string; lede: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-rule py-8">
      <h2 id={`${id}-h`} className="font-display text-2xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{lede}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SettingsForm({ initial }: { initial: ReaderPreferences }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (d: Partial<Draft>) => {
    setStatus("idle");
    setDraft((prev) => ({ ...prev, ...d }));
  };
  const save = () =>
    start(async () => {
      try {
        await savePreferences(draft);
        setStatus("saved");
        router.refresh();
      } catch (err) {
        setStatus("error");
        setError(err instanceof ApiError ? err.message : "Couldn't save.");
      }
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Group id="profile" title="Profile" lede="DAYBREAK asks for as little as possible. Your name only appears in your own paper.">
        <label className="block max-w-md">
          <span className="field-label">Name (optional)</span>
          <input className="input mt-1.5" value={draft.displayName} maxLength={40} onChange={(e) => set({ displayName: e.target.value })} />
        </label>
        <label className="mt-4 block max-w-md">
          <span className="field-label">Time zone (decides when a new day&apos;s edition starts)</span>
          <input className="input mt-1.5" value={draft.timezone} maxLength={64} onChange={(e) => set({ timezone: e.target.value })} />
        </label>
      </Group>
      <Group id="sections" title="Sections" lede="The sections that appear in your paper.">
        <SectionsField draft={draft} set={set} />
      </Group>
      <Group id="interests-explicit" title="Interests" lede="Specific subjects. Matching stories rank higher and say why.">
        <InterestsField draft={draft} set={set} />
      </Group>
      <Group id="region" title="Region" lede="Balance local and international coverage.">
        <RegionField draft={draft} set={set} />
      </Group>
      <Group id="depth" title="Depth and time" lede="How long your paper is.">
        <DepthField draft={draft} set={set} />
      </Group>
      <Group id="exclusions" title="Leave out" lede="Muted topics, publishers and keywords never appear.">
        <FineTuneField draft={draft} set={set} />
      </Group>
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-rule bg-paper/95 px-4 py-3 backdrop-blur">
        <span aria-live="polite" className="font-sans text-sm">
          {status === "saved" ? (
            <span className="inline-flex items-center gap-1 text-forest"><Check size={15} aria-hidden /> Saved. Changes apply to your next edition.</span>
          ) : status === "error" ? (
            <span className="text-accent">{error}</span>
          ) : null}
        </span>
        <button type="submit" className="btn btn-primary" disabled={pending || draft.sections.length === 0}>
          {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null} Save preferences
        </button>
      </div>
    </form>
  );
}
