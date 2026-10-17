import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  // CI keeps an HTML report as a build artifact; locally the list output is enough.
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    // Uses the system Google Chrome when available (no browser download needed).
    channel: process.env.PW_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL ?? "chrome" }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL ?? "chrome" }, grep: /@mobile/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        // Isolated demo-mode data and no regeneration cooldown for the journey test.
        env: { DATA_DIR: process.env.E2E_DATA_DIR ?? ".data-e2e", REGENERATE_COOLDOWN_SECONDS: "0" },
        url: `http://localhost:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
