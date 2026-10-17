"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { api } from "@/lib/client-api";
import { TOPICS, type TopicId } from "@/lib/topics";
import type { TopicSignal } from "@/lib/rank/learning";

interface Props {
  topics: Partial<Record<TopicId, TopicSignal>>;
  publishers: Record<string, { weight: number; events: number }>;
  signals: number;
  followed: TopicId[];
}

function Bar({ weight }: { weight: number }) {
  const pct = Math.round(Math.abs(weight) * 50);
  return (
    <div className="relative h-2 w-full bg-paper-deep" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-muted" />
      <div className={`absolute inset-y-0 ${weight >= 0 ? "left-1/2 bg-forest" : "right-1/2 bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** What DAYBREAK has inferred from feedback — inspectable and resettable per topic. */
export function LearnedInterests({ topics, publishers, signals, followed }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const entries = (Object.entries(topics) as [TopicId, TopicSignal][]).sort((a, b) => b[1].weight - a[1].weight);
  const pubs = Object.entries(publishers).filter(([, p]) => Math.abs(p.weight) >= 0.05).sort((a, b) => b[1].weight - a[1].weight);

  const reset = (body: { topic?: TopicId; all?: boolean }, label: string) =>
    start(async () => {
      const res = await api<{ removed: number }>("/api/interests", { method: "DELETE", body });
      setMessage(`Forgot ${res.removed} signal${res.removed === 1 ? "" : "s"} for ${label}.`);
      router.refresh();
    });

  if (entries.length === 0) {
    return (
      <p className="border border-dashed border-rule p-5 text-ink-soft">
        Nothing learned yet. As you save stories, open them, or mark them “not interested”, DAYBREAK builds a picture of what you value — and it will appear here, where you can inspect and reset it.
      </p>
    );
  }
  return (
    <div>
      <p className="font-sans text-xs text-muted">
        Based on {signals} recent signal{signals === 1 ? "" : "s"}. Each weight runs from −1 to +1 and decays with a 21-day half-life. Explicit choices (your sections) always count more than inferred ones.
      </p>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {entries.map(([topic, s]) => (
          <li key={topic} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[12rem_1fr_6rem_auto]">
            <span className="font-semibold">
              {TOPICS[topic].label}
              {followed.includes(topic) ? <span className="ml-1.5 font-sans text-[0.65rem] font-normal uppercase tracking-wider text-muted">followed</span> : null}
            </span>
            <span className="order-3 col-span-2 sm:order-none sm:col-span-1"><Bar weight={s.weight} /></span>
            <span className="font-sans text-xs tabular-nums text-muted">
              {s.weight > 0 ? "+" : ""}
              {s.weight.toFixed(2)} · {s.positive}↑ {s.negative}↓
            </span>
            <button type="button" className="inline-flex items-center gap-1 font-sans text-xs text-muted hover:text-accent" disabled={pending} onClick={() => reset({ topic }, TOPICS[topic].label)}>
              <RotateCcw size={12} aria-hidden /> Reset
            </button>
          </li>
        ))}
      </ul>
      {pubs.length ? (
        <p className="mt-4 font-sans text-xs text-muted">
          Publishers:{" "}
          {pubs.map(([name, p], i) => (
            <span key={name}>
              {i ? " · " : ""}
              {name} {p.weight > 0 ? "+" : ""}
              {p.weight.toFixed(2)}
            </span>
          ))}
        </p>
      ) : null}
      <div className="mt-4 flex items-center gap-4">
        <button type="button" className="btn btn-ghost !py-1.5" disabled={pending} onClick={() => reset({ all: true }, "all topics")}>
          <RotateCcw size={14} aria-hidden /> Forget everything learned
        </button>
        {message ? <span className="font-sans text-xs text-forest" aria-live="polite">{message}</span> : null}
      </div>
    </div>
  );
}
