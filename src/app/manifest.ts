import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DAYBREAK — your morning paper",
    short_name: "DAYBREAK",
    description: "A personal morning paper: real reporting from trusted publishers, ranked for you.",
    id: "/",
    start_url: "/newspaper?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f7f3ea",
    theme_color: "#1b1a17",
    categories: ["news"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
