import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Versions the service worker so each deployment replaces the previous cache.
  env: { NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "dev" },
  // @react-pdf/renderer ships its own font and layout engines; keep it out of the server bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // PDF fonts are read from disk at runtime; make sure they ship with the function bundles.
  outputFileTracingIncludes: {
    "/api/editions/[id]/pdf": ["./assets/fonts/**/*"],
  },
  // /paper was the reader's address before /newspaper; keep old links working.
  async redirects() {
    return [
      { source: "/paper", destination: "/newspaper", permanent: true },
      { source: "/paper/:id", destination: "/newspaper/:id", permanent: true },
      { source: "/signup", destination: "/login?mode=signup", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The worker must never be served stale, or updates would be delayed.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
