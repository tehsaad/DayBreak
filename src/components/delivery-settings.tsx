"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send } from "lucide-react";
import { api, ApiError } from "@/lib/client-api";
import type { DeliveryPreferences, PdfTemplate } from "@/lib/types";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface DeliveryStatus {
  /** Where the email would go, or null (demo mode / no address). */
  email: string | null;
  transport: "resend" | "file" | "log" | "disabled";
  nextDelivery: string | null;
  timezone: string;
}

const TRANSPORT_NOTE: Record<DeliveryStatus["transport"], string> = {
  resend: "Emails are sent through Resend.",
  file: "Development mode: emails are written to the server's local outbox (DATA_DIR/outbox), not sent.",
  log: "Development mode: emails are only logged, not sent.",
  disabled: "Email is not configured on this server, so scheduled runs prepare your paper but skip the email.",
};

/** Settings → Delivery: schedule, format and PDF template, saved server-side as a partial update. */
export function DeliverySettings({ initial, pdfTemplate: initialTemplate, status }: { initial: DeliveryPreferences; pdfTemplate: PdfTemplate; status: DeliveryStatus }) {
  const router = useRouter();
  const [d, setD] = useState<DeliveryPreferences>(initial);
  const [template, setTemplate] = useState<PdfTemplate>(initialTemplate);
  const [state, setState] = useState<{ kind: "idle" | "saved" | "error" | "sent"; message?: string }>({ kind: "idle" });
  const [pending, start] = useTransition();
  const [sending, startSend] = useTransition();
  const set = (patch: Partial<DeliveryPreferences>) => {
    setState({ kind: "idle" });
    setD((prev) => ({ ...prev, ...patch }));
  };

  const save = () =>
    start(async () => {
      try {
        await api("/api/preferences", { method: "PUT", body: { partial: true, delivery: d, pdfTemplate: template } });
        setState({ kind: "saved" });
        router.refresh();
      } catch (err) {
        setState({ kind: "error", message: err instanceof ApiError ? err.message : "Couldn't save." });
      }
    });

  const sendNow = () =>
    startSend(async () => {
      try {
        const res = await api<{ delivery: { status: string; error: string | null } | null; deduplicated: boolean }>("/api/runs", { body: { deliver: true } });
        const msg = res.deduplicated
          ? "Today's edition was already emailed; it was not sent again."
          : res.delivery?.status === "sent"
            ? `Sent to ${status.email}.`
            : `Not sent: ${res.delivery?.error ?? "delivery was skipped."}`;
        setState({ kind: "sent", message: msg });
        router.refresh();
      } catch (err) {
        setState({ kind: "error", message: err instanceof ApiError ? err.message : "Couldn't send." });
      }
    });

  const next = status.nextDelivery
    ? new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: status.timezone }).format(new Date(status.nextDelivery))
    : null;

  return (
    <section id="delivery" aria-labelledby="delivery-h" className="scroll-mt-24 border-t-2 border-ink py-8">
      <h2 id="delivery-h" className="font-display text-3xl font-extrabold">Delivery &amp; schedule</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Have your paper prepared and emailed at a set time. Your paper is always in the app too; this only adds the email.
      </p>
      <form
        className="mt-5 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="flex items-center gap-3 font-sans text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={d.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          <span className="font-semibold">Email me my paper on a schedule</span>
        </label>

        <fieldset disabled={!d.enabled} className="grid gap-4 disabled:opacity-60 sm:grid-cols-3">
          <label className="block">
            <span className="field-label">How often</span>
            <select className="input mt-1.5" value={d.frequency} onChange={(e) => set({ frequency: e.target.value as DeliveryPreferences["frequency"] })}>
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays (Mon–Fri)</option>
              <option value="weekly">Once a week</option>
            </select>
          </label>
          {d.frequency === "weekly" ? (
            <label className="block">
              <span className="field-label">Day</span>
              <select className="input mt-1.5" value={d.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
                {DAYS.map((day, i) => (
                  <option key={day} value={i}>{day}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block">
            <span className="field-label">Time ({status.timezone})</span>
            <input type="time" className="input mt-1.5" value={d.time} step={900} required onChange={(e) => set({ time: e.target.value })} />
          </label>
          <label className="block sm:col-span-1">
            <span className="field-label">Email contains</span>
            <select className="input mt-1.5" value={d.format} onChange={(e) => set({ format: e.target.value as DeliveryPreferences["format"] })}>
              <option value="link">Headlines + link to the edition</option>
              <option value="pdf">Headlines + PDF attached</option>
              <option value="both">Headlines, link and PDF</option>
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend className="field-label">PDF layout</legend>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="PDF layout">
            {([
              ["editorial", "Editorial newspaper", "Masthead, lead story with image, two-column pages."],
              ["briefing", "Minimal briefing", "One column, headlines and summaries only, no images."],
            ] as const).map(([id, label, hint]) => (
              <button key={id} type="button" role="radio" aria-checked={template === id} className="chip !items-start !rounded-md !py-2 text-left" onClick={() => setTemplate(id)}>
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-[0.72rem] opacity-80">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <ul className="space-y-1 font-sans text-xs text-muted">
          <li>{status.email ? `Sent to ${status.email}.` : "No email address is available for this account (demo mode), so delivery will be skipped."}</li>
          <li>{TRANSPORT_NOTE[status.transport]}</li>
          <li>{d.enabled ? (next ? `Next scheduled delivery: ${next}.` : "Save to schedule your first delivery.") : "Scheduled delivery is off."} Delivery runs every 30 minutes, so an email can arrive up to about half an hour after the time you pick.</li>
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
            Save delivery settings
          </button>
          <button type="button" className="btn btn-ghost" onClick={sendNow} disabled={sending || !status.email || status.transport === "disabled"}>
            {sending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Send size={15} aria-hidden />}
            Email today&apos;s paper now
          </button>
          <p role="status" aria-live="polite" className="font-sans text-sm">
            {state.kind === "saved" ? <span className="inline-flex items-center gap-1 text-forest"><Check size={15} aria-hidden /> Saved</span> : null}
            {state.kind === "sent" ? <span className="text-ink-soft">{state.message}</span> : null}
            {state.kind === "error" ? <span className="text-accent">{state.message}</span> : null}
          </p>
        </div>
      </form>
    </section>
  );
}
