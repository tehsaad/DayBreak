import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/api";
import { supabaseForRequest } from "@/lib/auth/reader";
import { storageMode } from "@/lib/env";

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  if (!sameOrigin(req)) return NextResponse.redirect(new URL("/", origin), 303);
  if (storageMode() === "supabase") {
    const supabase = await supabaseForRequest();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", origin), 303);
}
