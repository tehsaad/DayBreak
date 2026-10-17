import type { NextRequest } from "next/server";
import { sameOrigin } from "@/lib/api";
import { supabaseForRequest } from "@/lib/auth/reader";
import { loginRedirect, redirectTo } from "@/lib/auth/routes";
import { storageMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return redirectTo(req, "/");
  if (storageMode() === "supabase") {
    const supabase = await supabaseForRequest();
    // scope "local": sign out this browser only, revoking its refresh token.
    await supabase.auth.signOut({ scope: "local" });
  }
  return loginRedirect(req, { notice: "signed_out" });
}
