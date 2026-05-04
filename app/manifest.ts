import type { MetadataRoute } from "next";
import { notFound } from "next/navigation";

// Suppress manifest on Vercel preview deployments to prevent PWA install prompts
// on non-production builds.
export default function manifest(): MetadataRoute.Manifest {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    notFound();
  }

  return {
    id: "/",
    scope: "/",
    start_url: "/",
    name: "My こうとう (非公式)",
    short_name: "Myこうとう",
    description: "江東区の生活情報非公式アプリ",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#475569",
    background_color: "#ffffff",
    lang: "ja",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
