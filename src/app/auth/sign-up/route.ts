import type { NextRequest } from "next/server";
import { clientIp, log, rateLimit } from "@/lib/api";
import { supabaseForRequest } from "@/lib/auth/reader";
import { authErrorCode, PENDING_EMAIL_COOKIE } from "@/lib/auth/redirect";
import { guardAuthPost, loginRedirect, readForm, redirectTo, siteUrl, validEmail } from "@/lib/auth/routes";

export const dynamic = "force-dynamic";

/**
 * Create an account with email + password. With email confirmation enabled (Supabase's default)
 * no session is returned and the reader is asked to confirm; the link lands on /auth/callback.
 */
export async function POST(req: NextRequest) {
  const blocked = guardAuthPost(req);
  if (blocked) return blocked;
  if (!rateLimit("write", `auth:${clientIp(req)}`).ok) return loginRedirect(req, { mode: "signup", error: "rate_limited" });
  const form = await readForm(req);
  const email = (form.email ?? "").trim().toLowerCase();
  const password = form.password ?? "";
  if (!validEmail(email)) return loginRedirect(req, { mode: "signup", error: "invalid_email" });
  if (password.length < 8) return loginRedirect(req, { mode: "signup", error: "weak_password" });
  const supabase = await supabaseForRequest();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: siteUrl(req, "/auth/callback").toString() },
  });
  if (error) {
    log("auth_sign_up_failed", { code: error.code ?? null });
    return loginRedirect(req, { mode: "signup", error: authErrorCode(error) });
  }
  // Session present → confirmation is disabled on this project; continue straight to onboarding.
  if (data.session) return redirectTo(req, "/auth/continue");
  const res = loginRedirect(req, { notice: "check_email" });
  res.cookies.set(PENDING_EMAIL_COOKIE, email, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
  return res;
}
