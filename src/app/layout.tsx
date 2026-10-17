import type { Metadata, Viewport } from "next";
import { Inter, Newsreader, Source_Serif_4 } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OfflineBanner } from "@/components/offline-banner";
import "./globals.css";

const newsreader = Newsreader({ subsets: ["latin", "latin-ext"], variable: "--font-newsreader", style: ["normal", "italic"], display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], variable: "--font-source-serif", style: ["normal", "italic"], display: "swap" });
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "DAYBREAK — The world, filtered through you", template: "%s · DAYBREAK" },
  description: "A personal morning paper: real reporting from trusted publishers, ranked for you, explained, and printable.",
  applicationName: "DAYBREAK",
};

export const viewport: Viewport = {
  themeColor: "#f7f3ea",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${sourceSerif.variable} ${inter.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:font-sans focus:text-sm focus:text-paper">
          Skip to content
        </a>
        <SiteHeader />
        <OfflineBanner />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
