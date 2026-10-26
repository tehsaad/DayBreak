import { describe, expect, it } from "vitest";
import { normalizePreferences } from "@/lib/preferences";
import { verifyStories } from "@/lib/edition/verify";
import { estimateEditionMinutes, countWords } from "@/lib/reading-time";
import type { EditionStory } from "@/lib/types";
import { dueNow, nextDelivery, tzOffsetMinutes, zonedTimeToUtc } from "@/lib/workflow/schedule";

const daily = (time: string, timezone: string, frequency: "daily" | "weekdays" | "weekly" = "daily", weekday = 1) => ({
  timezone,
  delivery: { enabled: true, frequency, weekday, time, format: "link" as const },
});

describe("time zones", () => {
  it("converts local wall-clock times to UTC across daylight-saving changes", () => {
    // New York: EST (UTC-5) before 8 March 2026, EDT (UTC-4) after.
    expect(zonedTimeToUtc("2026-03-07", "07:00", "America/New_York").toISOString()).toBe("2026-03-07T12:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-09", "07:00", "America/New_York").toISOString()).toBe("2026-03-09T11:00:00.000Z");
    // …and back to EST on 1 November 2026.
    expect(zonedTimeToUtc("2026-10-31", "07:00", "America/New_York").toISOString()).toBe("2026-10-31T11:00:00.000Z");
    expect(zonedTimeToUtc("2026-11-02", "07:00", "America/New_York").toISOString()).toBe("2026-11-02T12:00:00.000Z");
    // No DST: Karachi is always UTC+5.
    expect(zonedTimeToUtc("2026-07-01", "07:00", "Asia/Karachi").toISOString()).toBe("2026-07-01T02:00:00.000Z");
    expect(tzOffsetMinutes("Asia/Karachi", new Date("2026-01-01T00:00:00Z"))).toBe(300);
  });

  it("resolves a time inside the spring-forward gap to a real instant, and an ambiguous one to its first occurrence", () => {
    // 02:30 does not exist in New York on 8 March 2026.
    const gap = zonedTimeToUtc("2026-03-08", "02:30", "America/New_York");
    expect(gap.toISOString()).toBe("2026-03-08T07:30:00.000Z"); // 03:30 EDT
    // 01:30 happens twice on 1 November 2026; the first is EDT.
    expect(zonedTimeToUtc("2026-11-01", "01:30", "America/New_York").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("delivery schedule", () => {
  const prefs = daily("07:00", "America/New_York");

  it("is due once the local time is reached, and not before", () => {
    expect(dueNow(prefs, new Date("2026-03-09T10:59:00Z"))).toMatchObject({ due: false, reason: "too_early" });
    const due = dueNow(prefs, new Date("2026-03-09T11:00:00Z"));
    expect(due).toMatchObject({ due: true, localDate: "2026-03-09" });
    // A late trigger the same local day is still due (caught up, not skipped).
    expect(dueNow(prefs, new Date("2026-03-10T03:00:00Z"))).toMatchObject({ due: true, localDate: "2026-03-09" });
  });

  it("uses the reader's local date, not the UTC date", () => {
    const karachi = daily("06:00", "Asia/Karachi");
    // 22:00 UTC on the 16th is 03:00 on the 17th in Karachi: the 17th's slot is not reached yet.
    expect(dueNow(karachi, new Date("2026-10-16T22:00:00Z"))).toMatchObject({ due: false, localDate: "2026-10-17" });
    expect(dueNow(karachi, new Date("2026-10-17T01:00:00Z"))).toMatchObject({ due: true, localDate: "2026-10-17" });
  });

  it("respects weekdays and weekly frequencies and the off switch", () => {
    const saturday = new Date("2026-10-17T15:00:00Z");
    expect(dueNow(daily("07:00", "UTC", "weekdays"), saturday).reason).toBe("not_delivery_day");
    expect(dueNow(daily("07:00", "UTC", "weekly", 6), saturday).due).toBe(true);
    expect(dueNow(daily("07:00", "UTC", "weekly", 1), saturday).due).toBe(false);
    expect(dueNow({ ...prefs, delivery: { ...prefs.delivery, enabled: false } }, saturday).reason).toBe("disabled");
  });

  it("computes the next delivery, skipping today once it is done", () => {
    const at = new Date("2026-10-17T09:00:00Z"); // Saturday, 05:00 in New York
    expect(nextDelivery(prefs, at)?.toISOString()).toBe("2026-10-17T11:00:00.000Z");
    expect(nextDelivery(prefs, at, { todayDone: true })?.toISOString()).toBe("2026-10-18T11:00:00.000Z");
    // Weekdays only: Saturday → Monday.
    expect(nextDelivery(daily("07:00", "America/New_York", "weekdays"), at)?.toISOString()).toBe("2026-10-19T11:00:00.000Z");
    // Across the November DST change the UTC hour moves, the local time does not.
    expect(nextDelivery(prefs, new Date("2026-11-01T13:00:00Z"), { todayDone: true })?.toISOString()).toBe("2026-11-02T12:00:00.000Z");
    expect(nextDelivery({ ...prefs, delivery: { ...prefs.delivery, enabled: false } }, at)).toBeNull();
  });
});

describe("delivery preferences", () => {
  it("validates delivery settings on the server", () => {
    expect(() => normalizePreferences({ delivery: { enabled: true, time: "25:00" } })).toThrow();
    expect(() => normalizePreferences({ delivery: { enabled: true, frequency: "hourly" } })).toThrow();
    const p = normalizePreferences({ delivery: { enabled: true, time: "06:30", format: "both" } });
    expect(p.delivery).toEqual({ enabled: true, frequency: "daily", weekday: 1, time: "06:30", format: "both" });
    expect(normalizePreferences({}).delivery.enabled).toBe(false);
  });

  it("keeps saved delivery settings when another form saves without them", () => {
    const saved = normalizePreferences({ delivery: { enabled: true, time: "06:30" }, pdfTemplate: "briefing" });
    const next = normalizePreferences({ sections: ["world"] }, saved);
    expect(next.delivery.time).toBe("06:30");
    expect(next.delivery.enabled).toBe(true);
    expect(next.pdfTemplate).toBe("briefing");
  });
});

function story(summary: string, excerpt: string, summarySource: "ai" | "source" = "ai", url = "https://example.com/a"): EditionStory {
  return {
    position: 0,
    section: "world",
    tier: "lead",
    article: { id: "a", url, title: "Flooding hits Sindh as rivers rise", excerpt, publisher: "Example News", sourceId: "x", author: null, imageUrl: null, publishedAt: null, topics: ["world"], regions: [], sample: false },
    summary,
    summarySource,
    whyItMatters: null,
    reasons: [],
    score: 1,
    scoreBreakdown: {},
    alsoReportedBy: [],
    biggerPicture: null,
  };
}

describe("grounding audit", () => {
  const excerpt = "Officials in Sindh said rivers were rising after days of heavy rain, and reportedly ordered evacuations in two districts.";

  it("keeps a grounded AI summary", () => {
    const { stories, report } = verifyStories([story("Officials in Sindh say rivers are rising after heavy rain and reportedly ordered evacuations in two districts.", excerpt)]);
    expect(report).toMatchObject({ aiSummaries: 1, reverted: 0 });
    expect(stories[0]!.summarySource).toBe("ai");
  });

  it("reverts summaries that invent numbers, names or drop a hedge", () => {
    const cases = [
      story("Officials in Sindh say 40,000 people were evacuated as rivers rose.", excerpt),
      story("Prime Minister Shehbaz Sharif ordered evacuations as rivers rose in Sindh.", excerpt),
      story("Officials ordered evacuations in two districts as rivers rose in Sindh.", excerpt),
    ];
    const { stories, report } = verifyStories(cases);
    expect(report.reverted).toBe(3);
    expect(report.problems.map((p) => p.problem)).toEqual(["number_not_in_source", "name_not_in_source", "drops_hedge"]);
    expect(stories.every((s) => s.summarySource === "source" && s.whyItMatters === null)).toBe(true);
  });

  it("flags stories without a safe source link and leaves publisher text untouched", () => {
    const { report, stories } = verifyStories([story(excerpt, excerpt, "source", "javascript:alert(1)")]);
    expect(report.problems).toEqual([{ position: 0, problem: "unsafe_or_missing_url" }]);
    expect(stories[0]!.summary).toBe(excerpt);
  });
});

describe("reading time", () => {
  it("is an estimate from word counts at the configured speed", () => {
    expect(countWords("  one two   three ")).toBe(3);
    const s = story("word ".repeat(230).trim(), "x", "source");
    const est = estimateEditionMinutes({ intro: "", stories: [{ ...s, article: { ...s.article, title: "" } }], threeThings: [] }, 230);
    expect(est).toEqual({ words: 230, minutes: 1 });
    expect(estimateEditionMinutes({ intro: "", stories: [], threeThings: [] }).minutes).toBe(1);
  });
});
