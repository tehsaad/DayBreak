import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // @react-pdf/renderer ships its own font and layout engines; keep it out of the server bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // PDF fonts are read from disk at runtime; make sure they ship with the function bundles.
  outputFileTracingIncludes: {
    "/api/editions/[id]/pdf": ["./assets/fonts/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
