import { NextResponse, type NextRequest } from "next/server";
import { sameOrigin } from "../api";
import { storageMode } from "../env";
import { NEXT_COOKIE, safeNext } from "./redirect";

/** Absolute URL on this deployment. */
export function siteUrl(req: NextRequest, path: string): URL {
  return new URL(path, req.nextUrl.origin);
}

export function redirectTo(req: NextRequest, path: string, status: 302 | 303 = 303): NextResponse {
  return NextResponse.redirect(siteUrl(req, path), status);
}

export function loginRedirect(req: NextRequest, params: Record<string, string>): NextResponse {
  const qs = new URLSearchParams(params).toString();
  return redirectTo(req, `/login${qs ? `?${qs}` : ""}`);
}

/** Remember `next` for after the round-trip through Supabase / Google (10 minutes, httpOnly). */
export function rememberNext(res: NextResponse, raw: string | null | undefined): NextResponse {
  const next = safeNext(raw);
  if (next) {
    res.cookies.set(NEXT_COOKIE, next, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  }
  return res;
}

/** Common guard for the auth form posts. */
export function guardAuthPost(req: NextRequest): NextResponse | null {
  if (storageMode() !== "supabase") return loginRedirect(req, { error: "not_configured" });
  if (!sameOrigin(req)) return loginRedirect(req, { error: "unknown" });
  return null;
}

export async function readForm(req: NextRequest): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/x-www-form-urlencoded") && !type.includes("multipart/form-data")) return {};
  const form = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v.slice(0, 500);
  return out;
}

export function validEmail(email: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email);
}
