import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkHealth } from "../scripts/ci/check-health.mjs";
import { checkEnv, parseEnvNames } from "../scripts/ci/check-vercel-env.mjs";

/** Shape of `vercel env ls production` output: names and metadata only, never values. */
const ENV_LS = `
Vercel CLI 62.2.0
> Environment Variables found for tehsaad/daybreak [412ms]

 name                               value               environments        created
 NEXT_PUBLIC_SUPABASE_URL           Encrypted           Production          3d ago
 NEXT_PUBLIC_SUPABASE_ANON_KEY      Encrypted           Production          3d ago
 SUPABASE_SERVICE_ROLE_KEY          Encrypted           Production          3d ago
 CRON_SECRET                        Encrypted           Production          3d ago
 ANTHROPIC_API_KEY                  Encrypted           Production          2d ago
`;

const script = (name: string) => path.resolve(import.meta.dirname, "../scripts/ci", name);
const run = (name: string, input: string) => {
  try {
    return { code: 0, out: execFileSync("node", [script(name)], { input, encoding: "utf8" }) };
  } catch (err) {
    const e = err as { status: number; stdout: string };
    return { code: e.status, out: e.stdout };
  }
};

describe("deploy gate: Vercel environment check", () => {
  it("accepts a complete production environment", () => {
    const names = parseEnvNames(ENV_LS);
    expect([...names]).toEqual(expect.arrayContaining(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]));
    expect(checkEnv(names).ok).toBe(true);
    expect(run("check-vercel-env.mjs", ENV_LS).code).toBe(0);
  });

  it("refuses to deploy without Supabase, cron or LLM configuration", () => {
    const { ok, missing } = checkEnv(parseEnvNames(ENV_LS.replace(/^ (CRON_SECRET|ANTHROPIC_API_KEY|SUPABASE_SERVICE_ROLE_KEY).*$/gm, "")));
    expect(ok).toBe(false);
    expect(missing.map((m) => m.label)).toEqual(["Supabase service-role key (server-only)", "Cron secret"]);
    expect(run("check-vercel-env.mjs", "").code).toBe(1);
  });

  it("refuses any secret exposed through a NEXT_PUBLIC_ variable", () => {
    const leaky = `${ENV_LS}\n NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY   Encrypted   Production   1m ago\n`;
    const result = checkEnv(parseEnvNames(leaky));
    expect(result.ok).toBe(false);
    expect(result.exposed).toEqual(["NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"]);
    const { code, out } = run("check-vercel-env.mjs", leaky);
    expect(code).toBe(1);
    expect(out).toMatch(/must not be a NEXT_PUBLIC_ variable/);
  });

  it("accepts the alternative variable names the app reads", () => {
    const alt = "NEXT_PUBLIC_SUPABASE_URL\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\nSUPABASE_SECRET_KEY\nCRON_SECRET\nAI_GATEWAY_API_KEY\n";
    expect(checkEnv(parseEnvNames(alt)).ok).toBe(true);
    const gemini = "NEXT_PUBLIC_SUPABASE_URL\nNEXT_PUBLIC_SUPABASE_ANON_KEY\nSUPABASE_SERVICE_ROLE_KEY\nCRON_SECRET\nGEMINI_API_KEY\nGNEWS_API_KEY\n";
    expect(checkEnv(parseEnvNames(gemini)).ok).toBe(true);
    expect(checkEnv(parseEnvNames("NEXT_PUBLIC_GNEWS_API_KEY\n")).exposed).toEqual(["NEXT_PUBLIC_GNEWS_API_KEY"]);
  });
});

describe("deploy gate: health smoke test", () => {
  const good = { ok: true, storage: "supabase", sharedNews: "supabase", news: "live", ai: { provider: "anthropic", model: "claude-haiku-5-5" }, cronSecretConfigured: true };

  it("passes a fully configured deployment", () => {
    expect(checkHealth(good)).toEqual({ ok: true, problems: [] });
    expect(run("check-health.mjs", JSON.stringify(good)).code).toBe(0);
  });

  it("fails demo-mode, sample-news, no-AI or no-cron deployments", () => {
    const bad = { ok: true, storage: "demo", sharedNews: "file", news: "sample", ai: null, cronSecretConfigured: false };
    expect(checkHealth(bad).problems).toHaveLength(4);
    // AI is optional by design: a deployment without a key passes with a labelled fallback.
    expect(checkHealth({ ...good, ai: null }).ok).toBe(true);
    // Accounts work but the shared news pool isn't durable without the service-role key.
    expect(checkHealth({ ...good, sharedNews: "instance-cache" }).problems).toEqual([expect.stringMatching(/SUPABASE_SERVICE_ROLE_KEY missing/)]);
    expect(run("check-health.mjs", JSON.stringify(bad)).code).toBe(1);
  });

  it("fails when the endpoint returns a protection page instead of JSON", () => {
    const { code, out } = run("check-health.mjs", "<html>Authentication Required</html>");
    expect(code).toBe(1);
    expect(out).toMatch(/did not return JSON/);
  });
});

describe("deploy workflow smoke test", () => {
  const wf = readFileSync(".github/workflows/deploy-production.yml", "utf8");
  const step = wf.slice(wf.indexOf("- name: Smoke-test candidate"), wf.indexOf("- name: Promote candidate to production"));
  it("never passes CLI flags or secrets to curl on the command line", () => {
    expect(step).not.toMatch(/vercel\S*"? curl[^\n]*--token/);
    expect(step).not.toMatch(/-H "x-vercel-protection-bypass: \$/);
    expect(step).toContain("-H @-");
    expect(step).toMatch(/--yes -- \\/);
  });
  it("checks the HTTP status, protection responses and the health body", () => {
    expect(step).toContain('if [ "$status" != "200" ]');
    expect(step).toMatch(/401\|403/);
    expect(step).toContain("node scripts/ci/check-health.mjs");
  });
});
