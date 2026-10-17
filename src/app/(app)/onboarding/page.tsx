import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/preferences-editor";
import { getReader } from "@/lib/auth/reader";
import { storageMode } from "@/lib/env";

export const metadata: Metadata = { title: "Design your paper" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const confirmed = (await searchParams).confirmed === "1";
  const mode = storageMode();
  const reader = await getReader();
  if (mode === "supabase" && !reader) redirect("/login?next=/onboarding");
  const prefs = reader ? await reader.store.getPreferences(reader.userId) : null;
  return (
    <>
      {confirmed ? (
        <p role="status" className="mx-auto mt-6 max-w-3xl border border-forest/30 bg-forest-soft px-4 py-2 font-sans text-sm text-forest sm:mx-auto">
          Email confirmed — welcome to DAYBREAK. Let&apos;s set up your paper.
        </p>
      ) : null}
      <OnboardingWizard initial={prefs} mode={mode} />
    </>
  );
}
