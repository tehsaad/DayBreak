import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { authErrorCode, destinationFor, isPrivatePath, safeNext } from "@/lib/auth/redirect";
import { proxy } from "@/proxy";
import type { ReaderPreferences } from "@/lib/types";

describe("redirect safety", () => {
  it("only accepts same-site relative paths", () => {
    expect(safeNext("/archive")).toBe("/archive");
    expect(safeNext("/explore?topic=climate")).toBe("/explore?topic=climate");
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "/auth/callback", "/api/editions", "", null]) {
      expect(safeNext(bad)).toBeNull();
    }
  });

  it("knows which pages are private", () => {
    for (const p of ["/newspaper", "/newspaper/abc", "/archive", "/saved", "/explore", "/search", "/settings", "/onboarding"]) expect(isPrivatePath(p)).toBe(true);
    for (const p of ["/", "/login", "/newspapers", "/auth/callback"]) expect(isPrivatePath(p)).toBe(false);
  });

  it("routes by persisted onboarding state", () => {
    expect(destinationFor(null)).toBe("/onboarding");
    expect(destinationFor({ onboardedAt: null } as ReaderPreferences)).toBe("/onboarding");
    expect(destinationFor({ onboardedAt: "2026-10-17T00:00:00Z" } as ReaderPreferences)).toBe("/newspaper");
  });

  it("never echoes raw provider error text", () => {
    expect(authErrorCode({ message: "Email rate limit exceeded", status: 429 })).toBe("rate_limited");
    expect(authErrorCode({ message: "something odd <script>" })).toBe("unknown");
  });
});

describe("proxy route protection", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  const withSupabase = () => {
    // No session cookie → Supabase reports "no session" locally, without a network call.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://umjwrmnicqflmkoifejj.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  };

  it("sends signed-out visitors of private pages to sign in, keeping where they were going", async () => {
    withSupabase();
    const res = await proxy(new NextRequest("https://daybreak-gilt.vercel.app/archive?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://daybreak-gilt.vercel.app/login?next=%2Farchive%3Fx%3D1");
  });

  it("lets everyone see the public homepage and sign-in page", async () => {
    withSupabase();
    for (const path of ["/", "/login"]) {
      const res = await proxy(new NextRequest(`https://daybreak-gilt.vercel.app${path}`));
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("does nothing in demo mode", async () => {
    const res = await proxy(new NextRequest("https://daybreak-gilt.vercel.app/newspaper"));
    expect(res.headers.get("location")).toBeNull();
  });
});
