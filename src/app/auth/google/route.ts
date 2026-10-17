import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/api";
import { supabaseForRequest } from "@/lib/auth/reader";
import { loginRedirect, rememberNext, siteUrl } from "@/lib/auth/routes";
import { storageMode } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Start "Continue with Google". Supabase builds the provider URL and stores the PKCE code
 * verifier in an httpOnly cookie; Google returns to /auth/callback with a one-time code.
 */
export async function GET(req: NextRequest) {
  if (storageMode() !== "supabase") return loginRedirect(req, { error: "not_configured" });
  const supabase = await supabaseForRequest();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: siteUrl(req, "/auth/callback").toString(), skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    log("auth_oauth_start_failed", { provider: "google", code: error?.code ?? null });
    return loginRedirect(req, { error: "oauth" });
  }
  return rememberNext(NextResponse.redirect(data.url, 303), req.nextUrl.searchParams.get("next"));
}
