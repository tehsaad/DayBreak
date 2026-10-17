import type { NextRequest } from "next/server";
import { getReader } from "@/lib/auth/reader";
import { destinationFor, NEXT_COOKIE, PENDING_EMAIL_COOKIE, safeNext } from "@/lib/auth/redirect";
import { loginRedirect, redirectTo } from "@/lib/auth/routes";

export const dynamic = "force-dynamic";

/**
 * Post-sign-in router. Identity is verified server-side (Supabase getUser); first-time readers
 * go to onboarding, returning readers to the newspaper (or the page they originally asked for).
 */
export async function GET(req: NextRequest) {
  const reader = await getReader();
  if (!reader) return loginRedirect(req, { error: "expired" });
  const prefs = await reader.store.getPreferences(reader.userId);
  const home = destinationFor(prefs);
  const wanted = safeNext(req.cookies.get(NEXT_COOKIE)?.value);
  const confirmed = req.nextUrl.searchParams.get("confirmed") === "1";
  const target = home === "/onboarding" ? `/onboarding${confirmed ? "?confirmed=1" : ""}` : wanted && wanted !== "/onboarding" ? wanted : "/newspaper";
  const res = redirectTo(req, target, 302);
  res.cookies.delete(NEXT_COOKIE);
  res.cookies.delete(PENDING_EMAIL_COOKIE);
  return res;
}
