import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { deliverEdition } from "@/lib/delivery/deliver";
import { NoContentError, generateEdition } from "@/lib/edition/generate";
import { FileStore } from "@/lib/store/file-store";
import { RunBusyError } from "@/lib/store/types";
import type { EmailMessage, SendResult } from "@/lib/email/resend";
import { backoffDelay, isTransient, PermanentError, TransientError, withRetry } from "@/lib/workflow/errors";
import { dispatch } from "@/lib/workflow/dispatch";
import { estimateCostUsd, MAX_AUTOMATIC_ATTEMPTS, runEditionWorkflow } from "@/lib/workflow/runner";
import { STAGES } from "@/lib/workflow/types";
import { PROFILES } from "./fixtures/profiles";
import { NOW } from "./fixtures/articles";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const noSleep = async () => undefined;
const fixed = (d: Date) => () => d;

function freshStore() {
  return new FileStore(path.join(mkdtempSync(path.join(tmpdir(), "daybreak-wf-")), "db.json"));
}

const deliveryPrefs = (time = "07:00") => ({ ...PROFILES.pakistanStudent, delivery: { enabled: true, frequency: "daily" as const, weekday: 1, time, format: "link" as const } });

describe("retry policy", () => {
  it("classifies transient and permanent failures", () => {
    expect(isTransient(new Error("fetch failed: ECONNRESET"))).toBe(true);
    expect(isTransient(new Error("HTTP 503 from upstream"))).toBe(true);
    expect(isTransient(new Error("Too Many Requests"))).toBe(true);
    expect(isTransient(new Error("No stories matched your preferences"))).toBe(false);
    expect(isTransient(new TransientError("x"))).toBe(true);
    // An explicit flag wins over the message text.
    expect(isTransient(new PermanentError("timeout in validation"))).toBe(false);
    expect(isTransient(new NoContentError("unavailable"))).toBe(false);
  });

  it("retries transient errors with bounded exponential backoff, never permanent ones", async () => {
    const delays: number[] = [];
    let calls = 0;
    const { value, attempts } = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new TransientError("timeout");
        return "ok";
      },
      { attempts: 4, baseMs: 100, capMs: 1000 },
      { sleep: async (ms) => void delays.push(ms) },
    );
    expect(value).toBe("ok");
    expect(attempts).toBe(3);
    expect(delays).toHaveLength(2);

    let permanentCalls = 0;
    await expect(withRetry(async () => { permanentCalls++; throw new PermanentError("bad input"); }, { attempts: 5, baseMs: 1, capMs: 1 }, { sleep: noSleep })).rejects.toThrow("bad input");
    expect(permanentCalls).toBe(1);

    let budgetCalls = 0;
    await expect(withRetry(async () => { budgetCalls++; throw new TransientError("timeout"); }, { attempts: 3, baseMs: 1, capMs: 1 }, { sleep: noSleep })).rejects.toThrow("timeout");
    expect(budgetCalls).toBe(3);
  });

  it("caps backoff delays", () => {
    expect(backoffDelay(10, 500, 4000, () => 1)).toBe(4000);
    expect(backoffDelay(1, 500, 4000, () => 1)).toBe(1000);
    expect(backoffDelay(3, 500, 4000, () => 0)).toBe(0);
  });
});

describe("edition workflow", () => {
  it("records every stage with status, timing and metrics for a manual run", async () => {
    const store = freshStore();
    const { run, edition, reused } = await runEditionWorkflow({ store, userId: USER, prefs: PROFILES.aiResearcher, trigger: "manual", mode: "ensure", ai: null, now: fixed(NOW) });
    expect(reused).toBe(false);
    expect(run.status).toBe("succeeded");
    expect(run.stages.map((s) => s.name)).toEqual([...STAGES]);
    const by = Object.fromEntries(run.stages.map((s) => [s.name, s]));
    expect(by.fetch!.status).toBe("succeeded");
    expect(by.fetch!.metrics.candidates).toBeGreaterThan(8);
    expect(by.rank!.metrics.selected).toBe(edition!.stories.length);
    // No LLM key: summarisation is skipped with an honest note, not faked.
    expect(by.summarize!.status).toBe("skipped");
    expect(by.summarize!.note).toMatch(/No language-model API key/);
    expect(by.verify!.metrics.sourceSummaries).toBe(edition!.stories.length);
    expect(by.render!.metrics.editionId).toBe(edition!.id);
    expect(by.deliver!.status).toBe("skipped");
    expect(run.usage.estimatedCostUsd).toBeNull();
    expect(run.editionId).toBe(edition!.id);
    expect(run.durationMs).toBeGreaterThanOrEqual(0);
    // Persisted and inspectable afterwards.
    const stored = await store.getWorkflowRun(USER, run.id);
    expect(stored?.status).toBe("succeeded");
    expect(stored?.stages.every((s) => s.status !== "pending" && s.status !== "running")).toBe(true);
  });

  it("is idempotent per key: a duplicate scheduled trigger reuses the finished run", async () => {
    const store = freshStore();
    const generate = vi.fn(generateEdition);
    const opts = { store, userId: USER, prefs: PROFILES.aiResearcher, trigger: "prepare" as const, idempotencyKey: "prepare:2026-10-17", mode: "ensure" as const, ai: null, now: fixed(NOW), generate };
    const first = await runEditionWorkflow(opts);
    const second = await runEditionWorkflow(opts);
    expect(second.reused).toBe(true);
    expect(second.run.id).toBe(first.run.id);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await store.listWorkflowRuns(USER)).toHaveLength(1);
  });

  it("allows only one running run per reader and recovers abandoned ones", async () => {
    const store = freshStore();
    const { run } = await runEditionWorkflow({ store, userId: USER, prefs: PROFILES.aiResearcher, trigger: "manual", mode: "ensure", ai: null, now: fixed(NOW) });
    await store.saveWorkflowRun({ ...run, status: "running", updatedAt: NOW.toISOString() });
    // A fresh running run blocks a second one…
    await expect(runEditionWorkflow({ store, userId: USER, prefs: PROFILES.aiResearcher, trigger: "manual", mode: "ensure", ai: null, now: fixed(new Date(NOW.getTime() + 60_000)) })).rejects.toBeInstanceOf(RunBusyError);
    // …another reader is unaffected…
    await expect(runEditionWorkflow({ store, userId: OTHER, prefs: PROFILES.climateReader, trigger: "manual", mode: "ensure", ai: null, now: fixed(NOW) })).resolves.toMatchObject({ reused: false });
    // …and after the stale window the abandoned run is marked failed and work continues.
    const later = new Date(NOW.getTime() + 30 * 60_000);
    const next = await runEditionWorkflow({ store, userId: USER, prefs: PROFILES.aiResearcher, trigger: "manual", mode: "ensure", ai: null, now: fixed(later) });
    expect(next.run.status).toBe("succeeded");
    const old = await store.getWorkflowRun(USER, run.id);
    expect(old?.status).toBe("failed");
    expect(old?.error?.message).toMatch(/Abandoned/);
  });

  it("records a failed stage and classifies the error", async () => {
    const store = freshStore();
    const prefs = { ...PROFILES.aiResearcher, sections: [], interests: [], mutedTopics: [...PROFILES.aiResearcher.sections] };
    const generate = vi.fn(async () => {
      throw Object.assign(new NoContentError("No stories matched your preferences."), { stage: "rank" });
    });
    const err = await runEditionWorkflow({ store, userId: USER, prefs, trigger: "manual", mode: "ensure", ai: null, now: fixed(NOW), generate }).catch((e) => e);
    expect(err).toBeInstanceOf(NoContentError);
    const run = err.run;
    expect(run.status).toBe("failed");
    expect(run.error).toMatchObject({ stage: "rank", transient: false });
    expect((await store.getWorkflowRun(USER, run.id))?.status).toBe("failed");
  });

  it("keeps the edition when delivery fails, and a retry resumes at delivery without regenerating or double-sending", async () => {
    const store = freshStore();
    const prefs = deliveryPrefs();
    const sent: EmailMessage[] = [];
    let fail = true;
    const send = async (m: EmailMessage): Promise<SendResult> => {
      if (fail) return { ok: false, reason: "rejected", status: 503 };
      sent.push(m);
      return { ok: true, id: "msg_1" };
    };
    const deliverImpl: typeof deliverEdition = (o) => deliverEdition({ ...o, send, transport: "resend", sleep: noSleep });
    const generate = vi.fn(generateEdition);
    const base = { store, userId: USER, prefs, trigger: "scheduled" as const, idempotencyKey: "scheduled:2026-10-17", mode: "ensure" as const, ai: null, now: fixed(NOW), deliver: { email: "reader@example.com", appUrl: "https://daybreak.test", format: "link" as const }, deliverImpl, generate, sleep: noSleep };

    const err = await runEditionWorkflow(base).catch((e) => e);
    expect(err.run.status).toBe("partial");
    expect(err.run.error).toMatchObject({ stage: "deliver", transient: true });
    expect(err.run.editionId).toBeTruthy();
    const failedDelivery = (await store.listDeliveries(USER))[0]!;
    expect(failedDelivery.status).toBe("failed");
    expect(failedDelivery.attempts).toBe(1);

    fail = false;
    const retried = await runEditionWorkflow(base);
    expect(retried.run.id).toBe(err.run.id);
    expect(retried.run.status).toBe("succeeded");
    expect(retried.run.attempt).toBe(2);
    expect(generate).toHaveBeenCalledTimes(1); // resumed from the saved edition
    expect(retried.run.stages.find((s) => s.name === "render")?.status).toBe("succeeded");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.idempotencyKey).toBe(`edition:${err.run.editionId}:email`);

    // Another trigger the same day: nothing new is sent.
    const again = await runEditionWorkflow(base);
    expect(again.reused).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("stops automatic retries after the retry budget", async () => {
    const store = freshStore();
    const generate = vi.fn(async () => {
      throw new TransientError("upstream timeout");
    });
    const opts = { store, userId: USER, prefs: PROFILES.aiResearcher, trigger: "prepare" as const, idempotencyKey: "prepare:2026-10-17", mode: "ensure" as const, ai: null, now: fixed(NOW), generate };
    for (let i = 0; i < MAX_AUTOMATIC_ATTEMPTS; i++) await expect(runEditionWorkflow(opts)).rejects.toThrow("upstream timeout");
    const final = await runEditionWorkflow(opts);
    expect(final.reused).toBe(true);
    expect(final.run.attempt).toBe(MAX_AUTOMATIC_ATTEMPTS);
    expect(generate).toHaveBeenCalledTimes(MAX_AUTOMATIC_ATTEMPTS);
  });

  it("honours a cancellation request at the next stage boundary", async () => {
    const store = freshStore();
    const err = await runEditionWorkflow({
      store,
      userId: USER,
      prefs: PROFILES.aiResearcher,
      trigger: "manual",
      mode: "ensure",
      ai: null,
      now: fixed(NOW),
      generate: async (o) => {
        // Simulate the reader pressing Cancel while the fetch stage runs.
        await o.tracker!.run("fetch", async () => {
          const [r] = await store.listWorkflowRuns(USER, 1);
          await store.saveWorkflowRun({ ...r!, cancelRequested: true });
        });
        await o.tracker!.run("rank", async () => "never");
        throw new Error("unreachable");
      },
    }).catch((e) => e);
    expect(err.run.status).toBe("cancelled");
    expect(err.run.stages.find((s: { name: string }) => s.name === "rank").status).toBe("skipped");
  });

  it("estimates cost only from configured prices", () => {
    expect(estimateCostUsd(1000, 500, {})).toBeNull();
    expect(estimateCostUsd(1_000_000, 1_000_000, { LLM_PRICE_INPUT_PER_MTOK: "0.15", LLM_PRICE_OUTPUT_PER_MTOK: "0.6" })).toBeCloseTo(0.75);
    expect(estimateCostUsd(null, null, { LLM_PRICE_INPUT_PER_MTOK: "1", LLM_PRICE_OUTPUT_PER_MTOK: "1" })).toBeNull();
  });
});

describe("delivery", () => {
  async function edition(store: FileStore) {
    return (await generateEdition({ store, userId: USER, prefs: PROFILES.aiResearcher, mode: "ensure", ai: null, now: NOW })).edition;
  }

  it("skips honestly when the reader has no email or email is not configured", async () => {
    const store = freshStore();
    const e = await edition(store);
    const noEmail = await deliverEdition({ store, edition: e, runId: "r1", email: null, format: "link", appUrl: "https://x.test", transport: "log" });
    expect(noEmail.delivery.status).toBe("skipped");
    const off = await deliverEdition({ store, edition: e, runId: "r1", email: "a@example.com", format: "link", appUrl: "https://x.test", transport: "disabled" });
    expect(off.delivery.status).toBe("skipped");
    expect(off.delivery.error).toMatch(/not configured/);
  });

  it("attaches a real PDF when asked and links every story to its source", async () => {
    const store = freshStore();
    const e = await edition(store);
    const sent: EmailMessage[] = [];
    const r = await deliverEdition({ store, edition: e, runId: "r1", email: "a@example.com", format: "both", appUrl: "https://x.test/", transport: "resend", send: async (m) => (sent.push(m), { ok: true, id: "m1" }), renderPdf: async () => Buffer.from("%PDF-1.4 test") });
    expect(r.delivery).toMatchObject({ status: "sent", providerId: "m1", format: "both" });
    expect(sent[0]!.attachments?.[0]?.filename).toBe(`daybreak-${e.editionDate}.pdf`);
    expect(sent[0]!.html).toContain(`https://x.test/newspaper/${e.id}`);
    for (const s of e.stories.slice(0, 8)) expect(sent[0]!.text).toContain(s.article.url);
    expect(sent[0]!.text).toMatch(/estimate/);
  });

  it("falls back to the link when the PDF cannot be rendered", async () => {
    const store = freshStore();
    const e = await edition(store);
    const sent: EmailMessage[] = [];
    const r = await deliverEdition({ store, edition: e, runId: "r1", email: "a@example.com", format: "pdf", appUrl: "https://x.test", transport: "resend", send: async (m) => (sent.push(m), { ok: true, id: "m1" }), renderPdf: async () => { throw new Error("font missing"); } });
    expect(r.pdfFallback).toMatch(/font missing/);
    expect(sent[0]!.attachments).toBeUndefined();
  });

  it("does not retry permanent provider rejections (e.g. invalid address)", async () => {
    const store = freshStore();
    const e = await edition(store);
    let calls = 0;
    await expect(deliverEdition({ store, edition: e, runId: "r1", email: "bad", format: "link", appUrl: "https://x.test", transport: "resend", sleep: noSleep, send: async () => (calls++, { ok: false, reason: "rejected", status: 422, message: "Invalid `to` field" }) })).rejects.toThrow(/422/);
    expect(calls).toBe(1);
    expect((await store.getDelivery(USER, `edition:${e.id}:email`))?.status).toBe("failed");
  });

  it("never shows another reader's delivery", async () => {
    const store = freshStore();
    const e = await edition(store);
    await deliverEdition({ store, edition: e, runId: "r1", email: "a@example.com", format: "link", appUrl: "https://x.test", transport: "log" });
    expect(await store.listDeliveries(OTHER)).toHaveLength(0);
    expect(await store.getDelivery(OTHER, `edition:${e.id}:email`)).toBeNull();
    expect(await store.listWorkflowRuns(OTHER)).toHaveLength(0);
  });
});

describe("dispatcher", () => {
  it("delivers only to readers who are due, once per local day", async () => {
    const store = freshStore();
    // Asia/Karachi is UTC+5: NOW (07:00 UTC) is 12:00 local.
    await store.savePreferences(USER, deliveryPrefs("08:00"));
    await store.savePreferences(OTHER, { ...deliveryPrefs("18:00") });
    const runs: string[] = [];
    const run: typeof runEditionWorkflow = async (o) => {
      runs.push(`${o.userId}:${o.idempotencyKey}`);
      return runEditionWorkflow({ ...o, deliverImpl: (d) => deliverEdition({ ...d, transport: "log" }) });
    };
    const opts = { store, appUrl: "https://x.test", budgetMs: 60_000, mode: "deliver" as const, useAi: false, ai: null, now: fixed(NOW), log: () => undefined, run };
    const first = await dispatch(opts);
    expect(first).toMatchObject({ due: 1, deliveryRuns: 1, failed: 0 });
    expect(runs).toEqual([`${USER}:scheduled:2026-10-17`]);
    expect(first.delaysSeconds[0]).toBe(4 * 3600);
    const second = await dispatch(opts);
    expect(second).toMatchObject({ due: 1, deliveryRuns: 0, alreadyDone: 1 });
  });

  it("prepares papers for readers without one and skips those who have one", async () => {
    const store = freshStore();
    await store.savePreferences(USER, PROFILES.aiResearcher);
    await store.savePreferences(OTHER, PROFILES.climateReader);
    await generateEdition({ store, userId: OTHER, prefs: PROFILES.climateReader, mode: "ensure", ai: null, now: NOW });
    const report = await dispatch({ store, appUrl: "https://x.test", budgetMs: 60_000, mode: "prepare", useAi: false, ai: null, now: fixed(NOW), log: () => undefined });
    expect(report).toMatchObject({ considered: 2, prepared: 1, alreadyDone: 1, failed: 0 });
  });
});
