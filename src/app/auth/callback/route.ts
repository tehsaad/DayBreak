import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { log } from "@/lib/api";
import { supabaseForRequest } from "@/lib/auth/reader";
import { authErrorCode } from "@/lib/auth/redirect";
import { loginRedirect, redirectTo } from "@/lib/auth/routes";
import { storageMode } from "@/lib/env";

export const dynamic = "force-dynamic";

const OTP_TYPES = new Set(["signup", "magiclink", "recovery", "invite", "email", "email_change"]);

/**
 * Finishes every sign-in round-trip:
 *  - OAuth / PKCE: ?code=…            → exchangeCodeForSession
 *  - email links:  ?token_hash=…&type=… → verifyOtp
 *  - provider errors / cancellation: ?error=…&error_description=…
 */
export async function GET(req: NextRequest) {
  if (storageMode() !== "supabase") return loginRedirect(req, { error: "not_configured" });
  const params = req.nextUrl.searchParams;

  const providerError = params.get("error") ?? params.get("error_code");
  if (providerError) {
    log("auth_callback_provider_error", { error: providerError.slice(0, 60) });
    const cancelled = providerError === "access_denied" || /cancel|denied/i.test(params.get("error_description") ?? "");
    return loginRedirect(req, { error: cancelled ? "cancelled" : /expired/i.test(params.get("error_code") ?? params.get("error_description") ?? "") ? "expired" : "provider" });
  }

  const supabase = await supabaseForRequest();
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      log("auth_code_exchange_failed", { code: error.code ?? null });
      return loginRedirect(req, { error: authErrorCode(error) === "unknown" ? "expired" : authErrorCode(error) });
    }
    return redirectTo(req, "/auth/continue", 302);
  }

  if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (error) {
      log("auth_otp_verify_failed", { code: error.code ?? null });
      return loginRedirect(req, { error: "expired" });
    }
    return redirectTo(req, "/auth/continue", 302);
  }

  return loginRedirect(req, { error: "expired" });
}
