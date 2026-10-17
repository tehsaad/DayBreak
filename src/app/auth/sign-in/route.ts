import type { NextRequest } from "next/server";
import { clientIp, log, rateLimit } from "@/lib/api";
import { supabaseForRequest } from "@/lib/auth/reader";
import { authErrorCode } from "@/lib/auth/redirect";
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
    return loginRedirect(req, { error: authErrorCode(error) });
  }
  return rememberNext(redirectTo(req, "/auth/continue"), form.next);
}
