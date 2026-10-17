import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/preferences-editor";
import { getReader } from "@/lib/auth/reader";
import { storageMode } from "@/lib/env";

export const metadata: Metadata = { title: "Design your paper" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const mode = storageMode();
  const reader = await getReader();
  if (mode === "supabase" && !reader) redirect("/login?next=/onboarding");
  const prefs = reader ? await reader.store.getPreferences(reader.userId) : null;
  return <OnboardingWizard initial={prefs} mode={mode} />;
}
