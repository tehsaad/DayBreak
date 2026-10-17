import type { Metadata, Viewport } from "next";
import { Inter, Newsreader, Source_Serif_4 } from "next/font/google";
import { OfflineBanner } from "@/components/offline-banner";
import { PwaInstall } from "@/components/pwa";
import "./globals.css";

const newsreader = Newsreader({ subsets: ["latin", "latin-ext"], variable: "--font-newsreader", style: ["normal", "italic"], display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], variable: "--font-source-serif", style: ["normal", "italic"], display: "swap" });
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "DAYBREAK — The world, filtered through you", template: "%s · DAYBREAK" },
  description: "A personal morning paper: real reporting from trusted publishers, ranked for you, explained, and printable.",
  applicationName: "DAYBREAK",
  appleWebApp: { capable: true, title: "DAYBREAK", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
};

export const viewport: Viewport = {
  themeColor: "#f7f3ea",
  width: "device-width",
  initialScale: 1,
};

/** Root layout: fonts and document only. The marketing site and the reader app add their own chrome. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${sourceSerif.variable} ${inter.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:font-sans focus:text-sm focus:text-paper">
          Skip to content
        </a>
        <OfflineBanner />
        {children}
        <PwaInstall />
      </body>
    </html>
  );
}
