import type { MetadataRoute } from "next";
import { notFound } from "next/navigation";
import { withBasePath } from "@/lib/site/base-path";

// Suppress manifest on Vercel preview deployments to prevent PWA install prompts
// on non-production builds.
export default function manifest(): MetadataRoute.Manifest {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    notFound();
  }

  // Manifest paths are interpreted relative to the page origin, not Next.js's
  // basePath — Next does not rewrite them. Prefix everything explicitly so the
  // installed PWA scope matches the served URL (Tailscale Funnel mount).
  const home = withBasePath("/") || "/";
  const icon192 = withBasePath("/icons/icon-192.png");

  return {
    id: home,
    scope: home,
    start_url: home,
    name: "My こうとう (非公式)",
    short_name: "Myこうとう",
    description: "江東区の生活情報非公式アプリ",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#475569",
    background_color: "#ffffff",
    lang: "ja",
    icons: [
      { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: withBasePath("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: withBasePath("/icons/icon-maskable-192.png"), sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: withBasePath("/icons/icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the installed-app icon to jump straight into the most
    // frequent flows. Limited to four because Android shows at most that
    // many; ordering reflects expected daily-use frequency.
    shortcuts: [
      {
        name: "ゴミ収集",
        short_name: "ゴミ",
        description: "収集日カレンダーと品目検索",
        url: withBasePath("/gomi"),
        icons: [{ src: icon192, sizes: "192x192", type: "image/png" }],
      },
      {
        name: "バス時刻表",
        short_name: "バス",
        description: "バス停名で検索 (都営バス・しおかぜ)",
        url: withBasePath("/bus"),
        icons: [{ src: icon192, sizes: "192x192", type: "image/png" }],
      },
      {
        name: "天気・防災情報",
        short_name: "天気",
        description: "気象警報・地震・WBGT",
        url: withBasePath("/weather"),
        icons: [{ src: icon192, sizes: "192x192", type: "image/png" }],
      },
      {
        name: "区民マップ",
        short_name: "マップ",
        description: "AED・公園・駅・病院などを検索",
        url: withBasePath("/map"),
        icons: [{ src: icon192, sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
