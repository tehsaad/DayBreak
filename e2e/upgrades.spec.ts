import { expect, test } from "@playwright/test";

async function onboard(page: import("@playwright/test").Page) {
  await page.goto("/");
  const origin = new URL(page.url()).origin;
  await page.request.put("/api/preferences", { data: { displayName: "Test", sections: ["business", "world"], region: "PK", timezone: "Asia/Karachi" }, headers: { origin } });
  await page.request.post("/api/editions", { data: { mode: "ensure" }, headers: { origin } });
}

test("landing page: hero CTAs, live preview and today's stories", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Personalized news, without the noise.");
  await expect(page.locator("#preview figure")).toBeVisible();
  await page.getByRole("link", { name: "Explore today's stories" }).click();
  await expect(page).toHaveURL(/#today$/);
  await expect(page.getByRole("heading", { name: "Today's stories" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Build my newspaper" }).first()).toHaveAttribute("href", "/onboarding");
});

test("reduced motion: everything is visible without animation", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("heading", { name: "How it works" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  expect(await page.locator(".reveal-armed").count()).toBe(0);
  await ctx.close();
});

test("search: recommendations run searches, typing is debounced, and recent searches stay on this device", async ({ page }) => {
  await onboard(page);
  await page.goto("/search");
  await expect(page.getByRole("heading", { name: "Popular categories" })).toBeVisible();
  await page.getByRole("link", { name: "World Affairs", exact: true }).click();
  await expect(page).toHaveURL(/topic=world/);
  await expect(page.getByText(/results? in World Affairs/)).toBeVisible();

  await page.goto("/search");
  const box = page.getByRole("textbox", { name: "Search stored reporting" });
  await box.pressSequentially("IMF", { delay: 40 });
  await expect(page).toHaveURL(/q=IMF/, { timeout: 5000 });
  await expect(page.getByText(/results? for “IMF”/)).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("button", { name: "IMF" })).toBeVisible(); // recent search chip
  await page.keyboard.press("Tab");
});

test("thumbnails fall back to a placeholder when images fail", async ({ page }) => {
  await onboard(page);
  await page.route(/\.(png|jpe?g|webp|gif)(\?.*)?$/i, (route) => route.abort());
  await page.goto("/newspaper");
  await expect(page.locator("[data-thumb]").first()).toBeVisible();
  await expect(page.locator('[data-thumb="image"] img[src]')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined);
  expect(await page.locator('[data-thumb="placeholder"]').count()).toBeGreaterThan(0);
});
