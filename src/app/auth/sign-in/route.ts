import type { NextRequest } from "next/server";
import { clientIp, log, rateLimit } from "@/lib/api";
import { supabaseForRequest } from "@/lib/auth/reader";
import { authErrorCode, PENDING_EMAIL_COOKIE } from "@/lib/auth/redirect";
import { guardAuthPost, loginRedirect, readForm, redirectTo, rememberNext, validEmail } from "@/lib/auth/routes";

export const dynamic = "force-dynamic";

/** Email + password sign-in (HTML form post; works without client JavaScript). */
export async function POST(req: NextRequest) {
  const blocked = guardAuthPost(req);
  if (blocked) return blocked;
  if (!rateLimit("write", `auth:${clientIp(req)}`).ok) return loginRedirect(req, { error: "rate_limited" });
  const form = await readForm(req);
  const email = (form.email ?? "").trim().toLowerCase();
  if (!validEmail(email) || !form.password) return loginRedirect(req, { error: validEmail(email) ? "credentials" : "invalid_email" });
  const supabase = await supabaseForRequest();
  const { error } = await supabase.auth.signInWithPassword({ email, password: form.password });
  if (error) {
    log("auth_sign_in_failed", { code: error.code ?? null });
    const code = authErrorCode(error);
    const res = loginRedirect(req, { error: code });
    // Unconfirmed account: prefill the resend-confirmation form with the address just typed.
    if (code === "unconfirmed") res.cookies.set(PENDING_EMAIL_COOKIE, email, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
    return res;
  }
  return rememberNext(redirectTo(req, "/auth/continue"), form.next);
}
