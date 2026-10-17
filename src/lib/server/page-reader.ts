import { redirect } from "next/navigation";
import { getReader, type ReaderContext } from "../auth/reader";
import { storageMode } from "../env";
import type { ReaderPreferences } from "../types";

/** For pages that need a reader with completed onboarding. Redirects otherwise. */
export async function requireReader(next: string): Promise<{ reader: ReaderContext; prefs: ReaderPreferences }> {
  const reader = await getReader();
  if (!reader) redirect(storageMode() === "supabase" ? `/login?next=${encodeURIComponent(next)}` : "/onboarding");
  const prefs = await reader.store.getPreferences(reader.userId);
  // First-time readers finish onboarding before anything else.
  if (!prefs?.onboardedAt) redirect("/onboarding");
  return { reader, prefs };
}
