import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { clientIp, log, rateLimit } from "@/lib/api";
import { supabaseForRequest } from "@/lib/auth/reader";
import { authErrorCode, PENDING_EMAIL_COOKIE } from "@/lib/auth/redirect";
import { guardAuthPost, loginRedirect, readForm, siteUrl, validEmail } from "@/lib/auth/routes";

export const dynamic = "force-dynamic";

const RESEND_COOLDOWN_SECONDS = 60;
const lastSent = new Map<string, number>();

/** Re-send the sign-up confirmation email, at most once a minute per address. */
export async function POST(req: NextRequest) {
  const blocked = guardAuthPost(req);
  if (blocked) return blocked;
  if (!rateLimit("write", `auth-resend:${clientIp(req)}`).ok) return loginRedirect(req, { error: "rate_limited" });
  const form = await readForm(req);
  const email = (form.email ?? "").trim().toLowerCase();
  if (!validEmail(email)) return loginRedirect(req, { error: "invalid_email" });

  // Per-address cooldown (hashed, so addresses aren't held in memory in the clear).
  const key = createHash("sha256").update(email).digest("hex");
  const now = Date.now();
  const since = (now - (lastSent.get(key) ?? 0)) / 1000;
  if (since < RESEND_COOLDOWN_SECONDS) return loginRedirect(req, { error: "resend_cooldown" });

  const supabase = await supabaseForRequest();
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: siteUrl(req, "/auth/callback").toString() } });
  if (error) {
    log("auth_resend_failed", { code: error.code ?? null });
    return loginRedirect(req, { error: authErrorCode(error) });
  }
  lastSent.set(key, now);
  if (lastSent.size > 5000) for (const [k, t] of lastSent) if (now - t > RESEND_COOLDOWN_SECONDS * 1000) lastSent.delete(k);
  const res = loginRedirect(req, { notice: "confirmation_resent" });
  res.cookies.set(PENDING_EMAIL_COOKIE, email, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
  return res;
}
