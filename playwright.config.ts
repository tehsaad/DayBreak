import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const AUTH_PORT = PORT + 1;
const channel = process.env.PW_CHANNEL ?? "chrome";

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
    channel,
    trace: "retain-on-failure",
  },
  projects: [
    // Demo storage: the full reader journey with sample or live news.
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel }, grepInvert: /@mobile|@auth/ },
    { name: "mobile", use: { ...devices["Pixel 7"], channel }, grep: /@mobile/ },
    // Supabase mode with an unreachable Supabase URL: auth pages, protection and errors only.
    { name: "auth", use: { ...devices["Desktop Chrome"], channel, baseURL: process.env.E2E_AUTH_BASE_URL ?? `http://localhost:${AUTH_PORT}` }, grep: /@auth/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: `npx next start -p ${PORT}`,
          url: `http://localhost:${PORT}/api/health`,
          reuseExistingServer: false,
          timeout: 60_000,
          // Isolated demo-mode data and no regeneration cooldown for the journey test.
          env: { DATA_DIR: process.env.E2E_DATA_DIR ?? ".data-e2e", REGENERATE_COOLDOWN_SECONDS: "0", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" },
        },
        {
          command: `npx next start -p ${AUTH_PORT}`,
          url: `http://localhost:${AUTH_PORT}/api/health`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: {
            DATA_DIR: ".data-e2e-auth",
            NEWS_MODE: "sample",
            // Nothing listens here: Supabase calls fail fast, which is what these tests exercise.
            NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_dummy",
            SUPABASE_SERVICE_ROLE_KEY: "",
          },
        },
      ],
});
