import { expect, test } from "@playwright/test";

/**
 * Supabase-mode checks against a server whose Supabase URL is deliberately unreachable
 * (see playwright.config.ts). This exercises DAYBREAK's own auth pages, route protection,
 * OAuth initiation and error handling deterministically. It does NOT prove a real Google or
 * Supabase sign-in works — that needs live credentials (see README → Testing).
 */
test.describe("@auth", () => {
  test("private pages send signed-out visitors to sign in and come back afterwards", async ({ page }) => {
    for (const path of ["/newspaper", "/archive", "/saved", "/explore", "/search", "/settings", "/onboarding"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[%]/g, "%")}`));
    }
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/auth/google?next=%2Fonboarding");
  });

  test("the public homepage works signed out and offers sign-up and sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Get started/ }).first()).toHaveAttribute("href", "/login?mode=signup");
    await page.getByRole("link", { name: "Sign in" }).first().click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.getByRole("link", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByLabel(/Password \(at least 8 characters\)/)).toHaveAttribute("minlength", "8");
  });

  test("Continue with Google starts a PKCE OAuth flow pointed at our callback", async ({ request }) => {
    const res = await request.get("/auth/google?next=/archive", { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    const location = new URL(res.headers()["location"]!);
    expect(location.pathname).toBe("/auth/v1/authorize");
    expect(location.searchParams.get("provider")).toBe("google");
    expect(location.searchParams.get("redirect_to")).toMatch(/\/auth\/callback$/);
    expect(location.searchParams.get("code_challenge_method")).toBe("s256");
    const cookies = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
    expect(cookies.some((c) => /code-verifier/.test(c))).toBe(true);
    expect(cookies.some((c) => /^daybreak_next=%2Farchive/.test(c) && /HttpOnly/i.test(c))).toBe(true);
  });

  test("callback errors show clear messages", async ({ page }) => {
    // (Next.js adds its own hidden route-announcer alert, so match ours by text.)
    await page.goto("/auth/callback?error=access_denied&error_description=The+user+denied+access");
    await expect(page.getByRole("alert").filter({ hasText: "Sign-in was cancelled" })).toBeVisible();
    await page.goto("/auth/callback?code=not-a-real-code");
    await expect(page.getByRole("alert").filter({ hasText: "expired or was already used" })).toBeVisible();
  });

  test("sign-in shows an error when the auth service can't be reached", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("reader@example.com");
    await page.getByLabel("Password").fill("not-a-real-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?error=/);
    await expect(page.getByRole("alert").filter({ hasText: /went wrong|don't match/ })).toBeVisible();
  });

  test("APIs refuse unauthenticated requests", async ({ request }) => {
    expect((await request.get("/api/editions")).status()).toBe(401);
    expect((await request.get("/api/preferences")).status()).toBe(401);
    expect((await request.get("/api/bookmarks")).status()).toBe(401);
    expect((await request.get("/api/health")).status()).toBe(200);
  });
});
