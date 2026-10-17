import { expect, test } from "@playwright/test";

test("Story Explorer opens for a story, groups sources and labels the non-AI fallback", async ({ page }) => {
  await page.goto("/");
  const origin = new URL(page.url()).origin;
  await page.request.put("/api/preferences", { data: { displayName: "Ex", sections: ["business", "world"], region: "PK", timezone: "Asia/Karachi" }, headers: { origin } });
  const { editionId } = await (await page.request.post("/api/editions", { data: { mode: "ensure" }, headers: { origin } })).json();
  const { edition } = await (await page.request.get(`/api/editions/${editionId}`)).json();
  const story = edition.stories[0];
  for (const s of edition.stories) expect(s.summary.length).toBeLessThanOrEqual(200); // copyright clamp on the API
  await page.goto(`/story/${story.article.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(story.article.title);
  await expect(page.getByText("Basic source grouping — no AI analysis")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How each publisher reported it" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to your newspaper" })).toHaveAttribute("href", "/newspaper");
  // Streamed pages keep a 200 status, so check that the not-found page is what renders.
  await page.goto("/story/does-not-exist-123");
  await expect(page.getByRole("heading", { name: "That page isn't in this edition." })).toBeVisible();
});

test("PWA: manifest, service worker and an offline page with no reader data", async ({ page, context }) => {
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ short_name: "DAYBREAK", display: "standalone" });
  const sw = await page.request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["cache-control"]).toContain("no-store");
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the worker
  await context.setOffline(true);
  await page.goto("/newspaper").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
});
