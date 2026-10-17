import { expect, test } from "@playwright/test";

/**
 * The essential reader journey in demo mode: onboarding → first edition → Bigger Picture →
 * "not interested" → regenerate → PDF → archive. Runs against whatever news the server has
 * (live feeds, or the labelled sample set when NEWS_MODE=sample).
 */
test("reader journey: onboard, read, give feedback, regenerate, download PDF, open archive", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DAYBREAK", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /Design your paper/ }).click();

  // Step 1: name
  await expect(page.getByRole("heading", { name: "Welcome to DAYBREAK" })).toBeVisible();
  await page.getByLabel(/What should we call you/).fill("Hamza");
  await page.getByRole("button", { name: /Next/ }).click();

  // Step 2: sections — start clean, choose Pakistan, Education, Business
  for (const name of ["World Affairs", "AI & Technology", "Science & Research"]) {
    const box = page.getByRole("checkbox", { name: new RegExp(name) });
    if ((await box.getAttribute("aria-checked")) === "true") await box.click();
  }
  for (const name of ["Pakistan", "Education & Scholarships", "Business & Economy"]) await page.getByRole("checkbox", { name: new RegExp(`^${name.replace(/[&]/g, "&")}`) }).click();
  await page.getByRole("button", { name: /Next/ }).click();

  // Step 3: interests
  await page.getByRole("button", { name: "Scholarships & fellowships" }).click();
  await page.getByRole("button", { name: "Pakistan's economy" }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  // Step 4: region
  await page.getByLabel("Where are you reading from?").selectOption("PK");
  await page.getByRole("button", { name: /Next/ }).click();

  // Step 5: depth
  await page.getByRole("radio", { name: /Balanced/ }).click();
  await page.getByRole("button", { name: /Next/ }).click();

  // Step 6: fine-tune (skip), then review and back-navigation works
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Ready to print" })).toBeVisible();
  await expect(page.getByText("Scholarships & fellowships")).toBeVisible();
  await page.getByRole("button", { name: /Print my first paper/ }).click();

  // First edition
  await page.waitForURL(/\/newspaper\/[0-9a-f-]{36}$/, { timeout: 90_000 });
  const firstUrl = page.url();
  await expect(page.getByText("Hamza's morning paper")).toBeVisible();
  const lead = page.locator("article").first();
  const leadTitle = (await lead.locator("h2").textContent())?.trim() ?? "";
  expect(leadTitle.length).toBeGreaterThan(5);
  await expect(page.getByRole("link", { name: /Read at|About this sample item/ }).first()).toHaveAttribute("href", /^https?:\/\//);

  // The Bigger Picture is open for the lead
  await expect(page.getByRole("region", { name: "The Bigger Picture" }).first().getByText("What happened")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Three Things to Remember" })).toBeVisible();

  // Open Bigger Picture on a section story (generated on demand and persisted)
  const sectionPanel = page.locator("section[aria-labelledby^='sec-'] [aria-label='The Bigger Picture'] button").first();
  if (await sectionPanel.count()) {
    await sectionPanel.click();
    await expect(page.locator("section[aria-labelledby^='sec-'] [aria-label='The Bigger Picture']").first().getByText("What happened")).toBeVisible();
  }

  // Save a story and mark the lead as not interested
  await page.getByRole("button", { name: "Save" }).nth(1).click();
  await expect(page.getByRole("button", { name: "Saved" }).first()).toBeVisible();
  await lead.getByRole("button", { name: /Not interested/ }).click();
  await expect(page.getByText(/future editions will carry fewer stories like this/)).toBeVisible();

  // Search within the edition
  await page.getByPlaceholder("Search this edition").fill("zzzz-no-match");
  await expect(page.getByText("0 stories match.")).toBeVisible();
  await page.getByPlaceholder("Search this edition").fill("");

  // Regenerate: new revision, the rejected lead is gone from the top
  const regen = page.getByRole("button", { name: /Regenerate/ });
  await regen.click();
  await page.waitForURL((u) => u.toString() !== firstUrl && /\/newspaper\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 90_000 }).catch(async () => {
    // Cooldown may apply; wait it out once.
    await page.waitForTimeout(46_000);
    await regen.click();
    await page.waitForURL((u) => u.toString() !== firstUrl, { timeout: 90_000 });
  });
  await expect(page.getByText(/Edition 2 ·/)).toBeVisible();
  const newLead = (await page.locator("article").first().locator("h2").textContent())?.trim();
  expect(newLead).not.toBe(leadTitle);
  const titles = await page.locator("article h2, article h3").allTextContents();
  expect(titles.map((t) => t.trim())).not.toContain(leadTitle);

  // PDF of this edition
  const editionId = page.url().split("/").pop()!;
  const pdf = await page.request.get(`/api/editions/${editionId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["x-daybreak-edition"]).toBe(editionId);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Archive shows both editions; the first one reopens unchanged
  await page.goto("/archive");
  await expect(page.getByText(/Edition 1 ·/)).toBeVisible();
  await expect(page.getByText(/Edition 2 ·/)).toBeVisible();
  await page.goto(firstUrl);
  await expect(page.locator("article").first().locator("h2")).toHaveText(leadTitle);

  // Saved and settings pages
  await page.goto("/saved");
  await expect(page.getByRole("heading", { name: "Saved stories" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Remove/ }).first()).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "What DAYBREAK has learned" })).toBeVisible();
  await expect(page.locator("#interests li").first()).toBeVisible();

  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "One story, many newsrooms" })).toBeVisible();

  expect(consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test("another reader cannot open someone else's edition", async ({ browser }) => {
  const a = await browser.newContext();
  const pa = await a.newPage();
  await pa.goto("/");
  const put = await pa.request.put("/api/preferences", { data: { sections: ["climate"], region: "GB", timezone: "Europe/London" }, headers: { origin: new URL(pa.url()).origin } });
  expect(put.ok()).toBeTruthy();
  const gen = await pa.request.post("/api/editions", { data: { mode: "ensure" }, headers: { origin: new URL(pa.url()).origin } });
  expect(gen.ok()).toBeTruthy();
  const { editionId } = await gen.json();

  const b = await browser.newContext();
  const pb = await b.newPage();
  await pb.goto("/");
  await pb.request.put("/api/preferences", { data: { sections: ["sports"] }, headers: { origin: new URL(pb.url()).origin } });
  expect((await pb.request.get(`/api/editions/${editionId}`)).status()).toBe(404);
  expect((await pb.request.get(`/api/editions/${editionId}/pdf`)).status()).toBe(404);
  const anon = await browser.newContext();
  expect((await (await anon.newPage()).request.get(`/api/editions/${editionId}`)).status()).toBe(401);
  await Promise.all([a.close(), b.close(), anon.close()]);
});

test("mobile layout has no horizontal scroll @mobile", async ({ page }) => {
  await page.goto("/");
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("link", { name: "Archive" })).toBeVisible();

  const origin = new URL(page.url()).origin;
  await page.request.put("/api/preferences", { data: { displayName: "Mobile", sections: ["pakistan", "education"], region: "PK", timezone: "Asia/Karachi" }, headers: { origin } });
  const gen = await page.request.post("/api/editions", { data: { mode: "ensure" }, headers: { origin } });
  const { editionId } = await gen.json();
  for (const path of [`/newspaper/${editionId}`, "/onboarding", "/settings", "/archive", "/explore"]) {
    await page.goto(path);
    expect(await overflow(), path).toBeLessThanOrEqual(1);
  }
});
