import type { NextRequest } from "next/server";
import { clientIp, log, rateLimit } from "@/lib/api";
import { supabaseForRequest } from "@/lib/auth/reader";
import { authErrorCode } from "@/lib/auth/redirect";
import { guardAuthPost, loginRedirect, readForm, rememberNext, siteUrl, validEmail } from "@/lib/auth/routes";

export const dynamic = "force-dynamic";

/** Email a one-time sign-in link (also creates the account on first use). */
export async function POST(req: NextRequest) {
  const blocked = guardAuthPost(req);
  if (blocked) return blocked;
  if (!rateLimit("write", `auth:${clientIp(req)}`).ok) return loginRedirect(req, { error: "rate_limited" });
  const form = await readForm(req);
  const email = (form.email ?? "").trim().toLowerCase();
  if (!validEmail(email)) return loginRedirect(req, { error: "invalid_email" });
  const supabase = await supabaseForRequest();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl(req, "/auth/callback").toString() } });
  if (error) {
    log("auth_magic_link_failed", { code: error.code ?? null });
    return loginRedirect(req, { error: authErrorCode(error) });
  }
  return rememberNext(loginRedirect(req, { notice: "magic_link_sent" }), form.next);
}
