import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { sendEmail, type EmailMessage, type SendResult } from "@/lib/email/resend";
import { emailShell, welcomeEmail } from "@/lib/email/templates";
import { claimWelcome, deliverWelcome, isGoogleUser } from "@/lib/auth/welcome";

const auth = vi.hoisted(() => ({ resend: vi.fn() }));
vi.mock("@/lib/auth/reader", () => ({ supabaseForRequest: async () => ({ auth }), getReader: async () => null }));

const googleUser = (id = "g1") => ({ id, email: "reader@example.com", app_metadata: { provider: "google" }, identities: [{ provider: "google" }], user_metadata: { given_name: "Hamza" } }) as unknown as User;
const emailUser = { id: "e1", email: "reader@example.com", app_metadata: { provider: "email" }, identities: [{ provider: "email" }], user_metadata: {} } as unknown as User;

/** A tiny fake of the profiles table: the claim UPDATE only matches while the column is null. */
function fakeProfiles() {
  const rows = new Map<string, { welcome_email_sent_at: string | null }>([["g1", { welcome_email_sent_at: null }]]);
  const client = {
    from: () => {
      let patch: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      let nullCheck: string | null = null;
      const q = {
        update(p: Record<string, unknown>) {
          patch = p;
          return q;
        },
        eq(col: string, v: unknown) {
          filters[col] = v;
          return q;
        },
        is(col: string) {
          nullCheck = col;
          return q;
        },
        select() {
          const row = rows.get(filters.id as string);
          const matches = row && (!nullCheck || row[nullCheck as "welcome_email_sent_at"] === null);
          if (matches) Object.assign(row, patch);
          return Promise.resolve({ data: matches ? [{ id: filters.id }] : [], error: null });
        },
        then(resolve: (v: unknown) => void) {
          const row = rows.get(filters.id as string);
          if (row) Object.assign(row, patch);
          resolve({ data: null, error: null });
        },
      };
      return q;
    },
  };
  return { client: client as never, rows };
}

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "DAYBREAK <hello@tehsaad.site>";
});
afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
});

describe("Resend client", () => {
  it("sends server-side with the API key and an idempotency key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    const r = await sendEmail({ to: "a@b.co", subject: "Hi", html: "<p>x</p>", text: "x", idempotencyKey: "k1" }, fetchImpl as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, id: "msg_1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test_key");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("k1");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "DAYBREAK <hello@tehsaad.site>", to: ["a@b.co"], text: "x" });
  });

  it("reports missing configuration and rejected requests without throwing", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail({ to: "a@b.co", subject: "s", html: "h", text: "t" })).toEqual({ ok: false, reason: "not_configured" });
    process.env.RESEND_API_KEY = "re_test_key";
    const rejected = (async () => new Response("{}", { status: 422 })) as unknown as typeof fetch;
    expect(await sendEmail({ to: "a@b.co", subject: "s", html: "h", text: "t" }, rejected)).toEqual({ ok: false, reason: "rejected", status: 422 });
  });
});

describe("templates", () => {
  it("escapes values and includes a plain-text alternative", () => {
    const w = welcomeEmail({ name: "<b>Sam</b>", appUrl: "https://daybreak-gilt.vercel.app" });
    expect(w.html).toContain("Welcome, &lt;b&gt;Sam&lt;/b&gt;.");
    expect(w.html).toContain('href="https://daybreak-gilt.vercel.app/newspaper"');
    expect(w.text).toContain("https://daybreak-gilt.vercel.app/newspaper");
    expect(emailShell({ preheader: "p", heading: "h", body: "b", cta: { label: "Go", href: "https://x.example/?a=1&b=2" }, footnote: "f" })).toContain("a=1&amp;b=2");
  });
});

describe("one-time welcome email after Google sign-in", () => {
  it("only Google accounts are eligible", () => {
    expect(isGoogleUser(googleUser())).toBe(true);
    expect(isGoogleUser(emailUser)).toBe(false);
  });

  it("claims once: a retried callback cannot send a second email", async () => {
    const { client, rows } = fakeProfiles();
    expect(await claimWelcome(client, googleUser())).toBe("claimed");
    expect(rows.get("g1")!.welcome_email_sent_at).not.toBeNull();
    expect(await claimWelcome(client, googleUser())).toBe("already_sent");
    expect(await claimWelcome(client, emailUser)).toBe("not_google");
  });

  it("doesn't claim when Resend isn't configured (so it can be sent once it is)", async () => {
    delete process.env.RESEND_API_KEY;
    const { client, rows } = fakeProfiles();
    expect(await claimWelcome(client, googleUser())).toBe("not_configured");
    expect(rows.get("g1")!.welcome_email_sent_at).toBeNull();
  });

  it("delivers with a per-user idempotency key, and releases the claim if sending fails", async () => {
    const { client, rows } = fakeProfiles();
    await claimWelcome(client, googleUser());
    const send = vi.fn<(m: EmailMessage) => Promise<SendResult>>(async () => ({ ok: true, id: "m" }));
    expect(await deliverWelcome(client, googleUser(), "https://daybreak-gilt.vercel.app", send)).toBe("sent");
    expect(send.mock.calls[0]![0]).toMatchObject({ to: "reader@example.com", idempotencyKey: "daybreak-welcome-g1", subject: "Welcome to DAYBREAK" });

    const failing = vi.fn<(m: EmailMessage) => Promise<SendResult>>(async () => ({ ok: false, reason: "network" }));
    expect(await deliverWelcome(client, googleUser(), "https://x", failing)).toBe("send_failed");
    expect(rows.get("g1")!.welcome_email_sent_at).toBeNull();
  });
});

describe("resend confirmation route", () => {
  const post = (email: string, ip: string) =>
    new NextRequest("https://daybreak-gilt.vercel.app/auth/resend", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://daybreak-gilt.vercel.app", host: "daybreak-gilt.vercel.app", "x-forwarded-for": ip },
      body: new URLSearchParams({ email }).toString(),
    });

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://umjwrmnicqflmkoifejj.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    auth.resend.mockReset();
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  it("resends a signup confirmation to our callback, then enforces a cooldown", async () => {
    auth.resend.mockResolvedValue({ data: {}, error: null });
    const { POST } = await import("@/app/auth/resend/route");
    const first = await POST(post("New@Example.com", "10.0.0.1"));
    expect(first.headers.get("location")).toBe("https://daybreak-gilt.vercel.app/login?notice=confirmation_resent");
    expect(auth.resend).toHaveBeenCalledWith({ type: "signup", email: "new@example.com", options: { emailRedirectTo: "https://daybreak-gilt.vercel.app/auth/callback" } });
    const again = await POST(post("new@example.com", "10.0.0.2"));
    expect(again.headers.get("location")).toBe("https://daybreak-gilt.vercel.app/login?error=resend_cooldown");
    expect(auth.resend).toHaveBeenCalledTimes(1);
  });

  it("validates the address and maps Supabase rate limits", async () => {
    const { POST } = await import("@/app/auth/resend/route");
    expect((await POST(post("nope", "10.0.0.3"))).headers.get("location")).toContain("error=invalid_email");
    auth.resend.mockResolvedValue({ data: {}, error: { message: "Email rate limit exceeded", status: 429 } });
    expect((await POST(post("other@example.com", "10.0.0.4"))).headers.get("location")).toContain("error=rate_limited");
  });
});
