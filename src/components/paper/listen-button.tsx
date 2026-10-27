"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Headphones, Pause, Play, Square } from "lucide-react";
import type { Edition } from "@/lib/types";

/**
 * "Listen" reads the edition aloud with the browser's built-in speech synthesis (Web Speech API).
 * No audio is generated on a server, nothing is sent to a TTS provider and it costs nothing; the
 * voice is whatever English voice the reader's device provides. Hidden when unsupported.
 */
const noopSubscribe = () => () => undefined;

export function ListenButton({ edition }: { edition: Edition }) {
  // False on the server and during hydration, then the browser's real capability.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined",
    () => false,
  );
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [index, setIndex] = useState(0);
  const chunks = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  if (!supported) return null;

  const script = () => [
    edition.intro,
    ...edition.stories.map((s) => `${s.article.title}. From ${s.article.publisher}. ${s.summary}`),
  ];

  const speakFrom = (i: number) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const parts = chunks.current;
    if (i >= parts.length) {
      setState("idle");
      setIndex(0);
      return;
    }
    const u = new SpeechSynthesisUtterance(parts[i]!);
    u.lang = "en";
    const voice = synth.getVoices().find((v) => v.lang.startsWith("en"));
    if (voice) u.voice = voice;
    u.onend = () => {
      setIndex(i + 1);
      speakFrom(i + 1);
    };
    u.onerror = (e) => {
      if (e.error !== "interrupted" && e.error !== "canceled") setState("idle");
    };
    setIndex(i);
    synth.speak(u);
    setState("playing");
  };

  const total = edition.stories.length + 1;
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Listen to this edition">
      {state === "idle" ? (
        <button
          type="button"
          className="btn btn-ghost !py-1.5"
          title="Reads the paper aloud using your device's voice"
          onClick={() => {
            chunks.current = script();
            speakFrom(0);
          }}
        >
          <Headphones size={15} aria-hidden /> Listen
        </button>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-ghost !py-1.5"
            onClick={() => {
              if (state === "playing") {
                window.speechSynthesis.pause();
                setState("paused");
              } else {
                window.speechSynthesis.resume();
                setState("playing");
              }
            }}
          >
            {state === "playing" ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
            {state === "playing" ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            className="btn btn-ghost !py-1.5"
            aria-label="Stop reading"
            onClick={() => {
              window.speechSynthesis.cancel();
              setState("idle");
              setIndex(0);
            }}
          >
            <Square size={13} aria-hidden />
          </button>
          <span className="font-sans text-xs text-muted" aria-live="polite">
            {index === 0 ? "Introduction" : `Story ${index} of ${total - 1}`}
          </span>
        </>
      )}
    </div>
  );
}
