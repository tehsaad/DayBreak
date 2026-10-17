#!/usr/bin/env node
/**
 * Verifies that a Vercel environment defines everything DAYBREAK needs before a production
 * deployment, and that no secret is exposed through a NEXT_PUBLIC_ variable.
 *
 * Reads the output of `vercel env ls production` on stdin. That command lists variable NAMES
 * only (never values), so this check works for Sensitive variables and never prints a secret.
 *
 *   vercel env ls production --token "$VERCEL_TOKEN" | node scripts/ci/check-vercel-env.mjs
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REQUIREMENTS = [
  { label: "Supabase project URL", anyOf: ["NEXT_PUBLIC_SUPABASE_URL"] },
  { label: "Supabase anon/publishable key", anyOf: ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] },
  { label: "Supabase service-role key (server-only)", anyOf: ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"] },
  { label: "Cron secret", anyOf: ["CRON_SECRET"] },
  {
    label: "LLM provider credentials",
    anyOf: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "AI_GATEWAY_API_KEY", "LLM_PROVIDER"],
  },
];

/** NEXT_PUBLIC_ values are inlined into browser bundles; none of these may ever be public. */
export const FORBIDDEN_PUBLIC = /^NEXT_PUBLIC_\w*(SERVICE_ROLE|SECRET|PRIVATE|API_KEY|TOKEN|PASSWORD)/;

/** Extract variable names from `vercel env ls` table output (first column of each row). */
export function parseEnvNames(text) {
  const names = new Set();
  for (const line of text.split(/\r?\n/)) {
    const first = line.trim().split(/\s+/)[0] ?? "";
    if (/^[A-Z][A-Z0-9_]{1,}$/.test(first) && first !== "NAME") names.add(first);
  }
  return names;
}

export function checkEnv(names) {
  const missing = REQUIREMENTS.filter((r) => !r.anyOf.some((n) => names.has(n)));
  const exposed = [...names].filter((n) => FORBIDDEN_PUBLIC.test(n));
  return { ok: missing.length === 0 && exposed.length === 0, missing, exposed };
}

function main() {
  const names = parseEnvNames(readFileSync(0, "utf8"));
  const { ok, exposed } = checkEnv(names);
  for (const r of REQUIREMENTS) {
    const found = r.anyOf.find((n) => names.has(n));
    console.log(`${found ? "✓" : "✗"} ${r.label}${found ? ` (${found})` : ` — set one of: ${r.anyOf.join(", ")}`}`);
  }
  for (const n of exposed) console.log(`✗ ${n} must not be a NEXT_PUBLIC_ variable: it would be shipped to every browser.`);
  if (!ok) {
    console.log("\nProduction environment is incomplete or unsafe; refusing to deploy.");
    process.exit(1);
  }
  console.log("\nProduction environment variables are present.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
