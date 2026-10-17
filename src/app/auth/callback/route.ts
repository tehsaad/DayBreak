import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/auth/reader";
import { storageMode } from "@/lib/env";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/paper";
  // Only same-site relative redirects.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/paper";
  if (storageMode() !== "supabase" || !code) return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  const supabase = await supabaseForRequest();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
