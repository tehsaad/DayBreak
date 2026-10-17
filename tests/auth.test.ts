import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ReaderContext } from "@/lib/auth/reader";
import { NEXT_COOKIE } from "@/lib/auth/redirect";
import type { ReaderPreferences } from "@/lib/types";

/**
 * Auth route handlers with a mocked Supabase client. These verify our own logic — redirects,
 * validation, CSRF, error mapping, first-login routing — not Supabase or Google themselves.
 */
const auth = {
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
};
let reader: ReaderContext | null = null;
// profiles.welcome_email_sent_at per user, for the welcome-email claim.
const welcomeSent = new Map<string, string | null>();
const afterTasks: (() => unknown)[] = [];

vi.mock("@/lib/auth/reader", () => ({
  supabaseForRequest: async () => ({ auth, from: profilesTable }),
  getReader: async () => reader,
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: (fn: () => unknown) => afterTasks.push(fn) }));

function profilesTable() {
  let patch: { welcome_email_sent_at?: string | null } = {};
  let id = "";
  let onlyIfNull = false;
  const q = {
    update: (p: typeof patch) => ((patch = p), q),
    eq: (_c: string, v: string) => ((id = v), q),
    is: () => ((onlyIfNull = true), q),
    select: async () => {
      const matches = welcomeSent.has(id) && (!onlyIfNull || welcomeSent.get(id) === null);
      if (matches) welcomeSent.set(id, patch.welcome_email_sent_at ?? null);
      return { data: matches ? [{ id }] : [], error: null };
    },
    then: (resolve: (v: unknown) => void) => (welcomeSent.set(id, patch.welcome_email_sent_at ?? null), resolve({ error: null })),
  };
  return q;
}

const ORIGIN = "https://daybreak-gilt.vercel.app";
const get = (path: string, cookies: Record<string, string> = {}) =>
  new NextRequest(`${ORIGIN}${path}`, { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } });
const post = (path: string, form: Record<string, string>, origin = ORIGIN) =>
  new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin, host: "daybreak-gilt.vercel.app" },
    body: new URLSearchParams(form).toString(),
  });
const location = (res: Response) => res.headers.get("location") ?? "";
const prefs = (onboarded: boolean) => ({ onboardedAt: onboarded ? "2026-10-17T00:00:00Z" : null }) as ReaderPreferences;
const readerWith = (p: ReaderPreferences | null): ReaderContext => ({ mode: "supabase", userId: "u1", email: "a@b.co", store: { getPreferences: async () => p } as never });

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://umjwrmnicqflmkoifejj.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
});
beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  reader = null;
  afterTasks.length = 0;
  welcomeSent.clear();
});

describe("Continue with Google", () => {
  it("redirects to the provider URL Supabase builds, with our callback, and remembers a safe `next`", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://umjwrmnicqflmkoifejj.supabase.co/auth/v1/authorize?provider=google&code_challenge=x" }, error: null });
    const { GET } = await import("@/app/auth/google/route");
    const res = await GET(get("/auth/google?next=/archive"));
    expect(res.status).toBe(303);
    expect(location(res)).toContain("/auth/v1/authorize?provider=google");
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: `${ORIGIN}/auth/callback`, skipBrowserRedirect: true } });
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${NEXT_COOKIE}=%2Farchive.*HttpOnly`, "i"));
  });

  it("ignores an unsafe `next` and reports provider errors", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://p.example/authorize" }, error: null });
    const { GET } = await import("@/app/auth/google/route");
    const res = await GET(get("/auth/google?next=//evil.example"));
    expect(res.headers.get("set-cookie") ?? "").not.toContain(NEXT_COOKIE);
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: "Unsupported provider: provider is not enabled", code: "validation_failed" } });
    const failed = await GET(get("/auth/google"));
    expect(location(failed)).toBe(`${ORIGIN}/login?error=oauth`);
  });
});

describe("email and password", () => {
  it("signs in and continues to the first-login router", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    const { POST } = await import("@/app/auth/sign-in/route");
    const res = await POST(post("/auth/sign-in", { email: "Reader@Example.com", password: "correct horse", next: "/saved" }));
    expect(res.status).toBe(303);
    expect(location(res)).toBe(`${ORIGIN}/auth/continue`);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "reader@example.com", password: "correct horse" });
    expect(res.headers.get("set-cookie")).toContain(`${NEXT_COOKIE}=%2Fsaved`);
  });

  it("maps wrong passwords and unconfirmed emails to friendly errors", async () => {
    const { POST } = await import("@/app/auth/sign-in/route");
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "Invalid login credentials", code: "invalid_credentials", status: 400 } });
    expect(location(await POST(post("/auth/sign-in", { email: "a@b.co", password: "x" })))).toBe(`${ORIGIN}/login?error=credentials`);
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "Email not confirmed", code: "email_not_confirmed", status: 400 } });
    expect(location(await POST(post("/auth/sign-in", { email: "a@b.co", password: "x" })))).toBe(`${ORIGIN}/login?error=unconfirmed`);
  });

  it("rejects cross-site form posts", async () => {
    const { POST } = await import("@/app/auth/sign-in/route");
    const res = await POST(post("/auth/sign-in", { email: "a@b.co", password: "x" }, "https://evil.example"));
    expect(location(res)).toBe(`${ORIGIN}/login?error=unknown`);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("signs up with email confirmation and a callback link to this site", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: "u" }, session: null }, error: null });
    const { POST } = await import("@/app/auth/sign-up/route");
    const res = await POST(post("/auth/sign-up", { email: "new@example.com", password: "longenough" }));
    expect(location(res)).toBe(`${ORIGIN}/login?notice=check_email`);
    expect(auth.signUp).toHaveBeenCalledWith({ email: "new@example.com", password: "longenough", options: { emailRedirectTo: `${ORIGIN}/auth/callback` } });
  });

  it("continues immediately when the project returns a session (confirmation disabled)", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: "u" }, session: { access_token: "t" } }, error: null });
    const { POST } = await import("@/app/auth/sign-up/route");
    expect(location(await POST(post("/auth/sign-up", { email: "new@example.com", password: "longenough" })))).toBe(`${ORIGIN}/auth/continue`);
  });

  it("validates sign-up input before calling Supabase", async () => {
    const { POST } = await import("@/app/auth/sign-up/route");
    expect(location(await POST(post("/auth/sign-up", { email: "new@example.com", password: "short" })))).toBe(`${ORIGIN}/login?mode=signup&error=weak_password`);
    expect(location(await POST(post("/auth/sign-up", { email: "not-an-email", password: "longenough" })))).toBe(`${ORIGIN}/login?mode=signup&error=invalid_email`);
    auth.signUp.mockResolvedValue({ data: {}, error: { message: "User already registered", code: "user_already_exists" } });
    expect(location(await POST(post("/auth/sign-up", { email: "old@example.com", password: "longenough" })))).toBe(`${ORIGIN}/login?mode=signup&error=exists`);
  });

  it("sends a magic link", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const { POST } = await import("@/app/auth/magic-link/route");
    expect(location(await POST(post("/auth/magic-link", { email: "a@b.co" })))).toBe(`${ORIGIN}/login?notice=magic_link_sent`);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: "a@b.co", options: { emailRedirectTo: `${ORIGIN}/auth/callback` } });
  });
});

describe("auth callback", () => {
  it("treats a cancelled Google consent as cancelled", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const res = await GET(get("/auth/callback?error=access_denied&error_description=The+user+denied+the+request"));
    expect(location(res)).toBe(`${ORIGIN}/login?error=cancelled`);
  });

  it("exchanges an OAuth code for a session", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: {}, user: { id: "u1", email: "a@b.co", app_metadata: { provider: "email" } } }, error: null });
    const { GET } = await import("@/app/auth/callback/route");
    const res = await GET(get("/auth/callback?code=abc"));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(location(res)).toBe(`${ORIGIN}/auth/continue`);
  });

  it("reports an expired or reused code", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: { message: "invalid flow state, no valid flow state found", code: "flow_state_not_found" } });
    const { GET } = await import("@/app/auth/callback/route");
    expect(location(await GET(get("/auth/callback?code=old")))).toBe(`${ORIGIN}/login?error=expired`);
  });

  it("verifies email confirmation links and rejects unknown types", async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    const { GET } = await import("@/app/auth/callback/route");
    expect(location(await GET(get("/auth/callback?token_hash=h&type=signup")))).toBe(`${ORIGIN}/auth/continue?confirmed=1`);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "h", type: "signup" });
    expect(location(await GET(get("/auth/callback?token_hash=h&type=bogus")))).toBe(`${ORIGIN}/login?error=expired`);
    expect(location(await GET(get("/auth/callback")))).toBe(`${ORIGIN}/login?error=expired`);
  });
});

describe("welcome email via the OAuth callback", () => {
  const google = { id: "g1", email: "reader@example.com", app_metadata: { provider: "google" }, identities: [{ provider: "google" }], user_metadata: { given_name: "Hamza" } };

  it("sends exactly one welcome email for a first Google sign-in, even if the callback is retried", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "DAYBREAK <hello@tehsaad.site>";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
    try {
      welcomeSent.set("g1", null);
      auth.exchangeCodeForSession.mockResolvedValue({ data: { session: {}, user: google }, error: null });
      const { GET } = await import("@/app/auth/callback/route");
      expect(location(await GET(get("/auth/callback?code=first")))).toBe(`${ORIGIN}/auth/continue`);
      expect(location(await GET(get("/auth/callback?code=retry")))).toBe(`${ORIGIN}/auth/continue`);
      expect(afterTasks).toHaveLength(1); // only the first callback claimed the email
      await afterTasks[0]!();
      const resendCalls = fetchSpy.mock.calls.filter(([url]) => String(url) === "https://api.resend.com/emails");
      expect(resendCalls).toHaveLength(1);
      expect(welcomeSent.get("g1")).not.toBeNull();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.RESEND_API_KEY;
      delete process.env.RESEND_FROM_EMAIL;
    }
  });

  it("never sends a welcome email for email/password accounts and needs no second confirmation for Google", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "DAYBREAK <hello@tehsaad.site>";
    welcomeSent.set("e1", null);
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: {}, user: { id: "e1", email: "a@b.co", app_metadata: { provider: "email" } } }, error: null });
    const { GET } = await import("@/app/auth/callback/route");
    expect(location(await GET(get("/auth/callback?code=x")))).toBe(`${ORIGIN}/auth/continue`);
    expect(afterTasks).toHaveLength(0);
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it("marks confirmed email links so onboarding can say so", async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    const { GET } = await import("@/app/auth/callback/route");
    expect(location(await GET(get("/auth/callback?token_hash=h&type=email")))).toBe(`${ORIGIN}/auth/continue?confirmed=1`);
    reader = readerWith(null);
    const cont = await (await import("@/app/auth/continue/route")).GET(get("/auth/continue?confirmed=1"));
    expect(location(cont)).toBe(`${ORIGIN}/onboarding?confirmed=1`);
  });
});

describe("first-login routing", () => {
  it("sends unauthenticated requests back to sign-in", async () => {
    const { GET } = await import("@/app/auth/continue/route");
    expect(location(await GET(get("/auth/continue")))).toBe(`${ORIGIN}/login?error=expired`);
  });

  it("sends first-time readers to onboarding, even if they asked for another page", async () => {
    reader = readerWith(null);
    const { GET } = await import("@/app/auth/continue/route");
    expect(location(await GET(get("/auth/continue", { [NEXT_COOKIE]: "%2Farchive" })))).toBe(`${ORIGIN}/onboarding`);
    reader = readerWith(prefs(false)); // draft saved, onboarding not finished
    expect(location(await GET(get("/auth/continue")))).toBe(`${ORIGIN}/onboarding`);
  });

  it("sends returning readers to the newspaper, or the page they asked for", async () => {
    reader = readerWith(prefs(true));
    const { GET } = await import("@/app/auth/continue/route");
    expect(location(await GET(get("/auth/continue")))).toBe(`${ORIGIN}/newspaper`);
    const res = await GET(get("/auth/continue", { [NEXT_COOKIE]: "%2Farchive" }));
    expect(location(res)).toBe(`${ORIGIN}/archive`);
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${NEXT_COOKIE}=;`));
  });

  it("signs out this browser and confirms it", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    const { POST } = await import("@/app/auth/signout/route");
    const res = await POST(post("/auth/signout", {}));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(location(res)).toBe(`${ORIGIN}/login?notice=signed_out`);
  });
});
