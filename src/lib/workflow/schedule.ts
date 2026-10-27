import { editionDateFor } from "../preferences";
import type { DeliveryPreferences, ReaderPreferences } from "../types";

/**
 * Delivery schedules are stored as a local wall-clock time plus an IANA time zone ("07:00" in
 * "America/New_York"), never as a UTC hour, so they follow daylight-saving changes automatically.
 *
 * A reader is *due* when, in their own time zone, today is a delivery day, the local time has
 * reached the delivery time, and no scheduled run has succeeded for that local date. Because
 * due-ness is "time reached and not yet done" rather than "this exact hour", a late or skipped
 * trigger still delivers (late) the same day, and a duplicate trigger finds the run already done.
 */

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(timezone: string, at: Date): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday as string] ?? 0,
  };
}

/** Offset of `timezone` from UTC at instant `at`, in minutes (e.g. +300 for Asia/Karachi). */
export function tzOffsetMinutes(timezone: string, at: Date): number {
  const p = localParts(timezone, at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * The UTC instant of a local wall-clock time. A time that does not exist (inside a spring-forward
 * gap) resolves to the instant one gap-length later, e.g. 02:30 → 03:30 local; an ambiguous time
 * (fall-back overlap) resolves to its first occurrence.
 */
export function zonedTimeToUtc(date: string, time: string, timezone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes converge for every real-world zone (offset changes at most once near the target).
  const first = wall - tzOffsetMinutes(timezone, new Date(wall)) * 60_000;
  const second = wall - tzOffsetMinutes(timezone, new Date(first)) * 60_000;
  const exact = [first, second].filter((t) => {
    const p = localParts(timezone, new Date(t));
    return p.hour === hh && p.minute === mm && p.day === d;
  });
  // Overlap: earliest real occurrence. Gap: no candidate matches, take the later instant.
  return new Date(exact.length ? Math.min(...exact) : Math.max(first, second));
}

export function isDeliveryDay(delivery: DeliveryPreferences, weekday: number): boolean {
  if (delivery.frequency === "daily") return true;
  if (delivery.frequency === "weekdays") return weekday >= 1 && weekday <= 5;
  return weekday === delivery.weekday;
}

export interface DueCheck {
  due: boolean;
  /** The reader's local date the delivery belongs to. */
  localDate: string;
  /** UTC instant the delivery was scheduled for (today's slot), or null when today is not a delivery day. */
  scheduledFor: Date | null;
  reason: "disabled" | "not_delivery_day" | "too_early" | "due";
}

/** Whether today's scheduled delivery should run now (the caller checks whether it already ran). */
export function dueNow(prefs: Pick<ReaderPreferences, "delivery" | "timezone">, now: Date): DueCheck {
  const localDate = editionDateFor(prefs.timezone, now);
  if (!prefs.delivery.enabled) return { due: false, localDate, scheduledFor: null, reason: "disabled" };
  const p = localParts(prefs.timezone, now);
  if (!isDeliveryDay(prefs.delivery, p.weekday)) return { due: false, localDate, scheduledFor: null, reason: "not_delivery_day" };
  const scheduledFor = zonedTimeToUtc(localDate, prefs.delivery.time, prefs.timezone);
  if (now < scheduledFor) return { due: false, localDate, scheduledFor, reason: "too_early" };
  return { due: true, localDate, scheduledFor, reason: "due" };
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The next scheduled delivery: today's slot unless today's delivery is already done (an overdue
 * slot is returned as-is, since the next dispatch will run it). Null when delivery is off.
 */
export function nextDelivery(prefs: Pick<ReaderPreferences, "delivery" | "timezone">, now: Date, opts: { todayDone?: boolean } = {}): Date | null {
  if (!prefs.delivery.enabled) return null;
  const today = editionDateFor(prefs.timezone, now);
  for (let i = 0; i < 8; i++) {
    const date = addDays(today, i);
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (!isDeliveryDay(prefs.delivery, weekday)) continue;
    const at = zonedTimeToUtc(date, prefs.delivery.time, prefs.timezone);
    // Today's slot counts until it has run: an overdue slot is picked up by the next dispatch.
    if (i === 0 && opts.todayDone) continue;
    return at;
  }
  return null;
}
