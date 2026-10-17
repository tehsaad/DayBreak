import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";

/** The signed-in reader experience: newspaper, explore, search, archive, saved, settings. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter compact />
    </>
  );
}
