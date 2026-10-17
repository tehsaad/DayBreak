#!/usr/bin/env node
/**
 * Validates the JSON from GET /api/health of a candidate production deployment.
 * The endpoint reports which features are configured without revealing any secret.
 *
 *   curl -fsS "$URL/api/health" | node scripts/ci/check-health.mjs
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function checkHealth(health) {
  const problems = [];
  if (!health || health.ok !== true) problems.push("health endpoint did not report ok");
  if (health?.storage !== "supabase") problems.push(`storage is "${health?.storage}", expected "supabase" (Supabase variables missing or invalid)`);
  if (health?.news !== "live") problems.push(`news mode is "${health?.news}", expected "live" (NEWS_MODE must not be "sample" in production)`);
  if (!health?.ai?.provider) problems.push("no LLM provider is configured");
  if (health?.cronSecretConfigured !== true) problems.push("CRON_SECRET is not configured");
  return { ok: problems.length === 0, problems };
}

function main() {
  const raw = readFileSync(0, "utf8");
  let health;
  try {
    health = JSON.parse(raw);
  } catch {
    console.log("✗ /api/health did not return JSON (is the deployment protected? see README → Continuous deployment).");
    process.exit(1);
  }
  const { ok, problems } = checkHealth(health);
  if (!ok) {
    for (const p of problems) console.log(`✗ ${p}`);
    process.exit(1);
  }
  console.log(`✓ storage=${health.storage} news=${health.news} ai=${health.ai.provider}/${health.ai.model} cron=configured`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
