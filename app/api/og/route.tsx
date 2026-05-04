import { ImageResponse } from "next/og";
import { validateOgTitle } from "@/lib/og";
import { SITE_TITLE } from "@/config/site";
import { checkRateLimit } from "@/lib/api-shared";

export const runtime = "edge";

export async function GET(request: Request): Promise<Response> {
  // Tight limit because each request rasterises a 1200x630 PNG via Satori —
  // amplification target without throttling (S-02).
  const rl = await checkRateLimit(request, {
    bucket: "og",
    limit: 30,
    windowSec: 60,
  });
  if (!rl.ok) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfter) },
    });
  }

  const { searchParams } = new URL(request.url);
  const rawTitle = searchParams.get("title") ?? "";
  const validTitle = rawTitle ? validateOgTitle(rawTitle) : null;

  const displayTitle = validTitle ?? SITE_TITLE;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            backgroundColor: "#475569",
            height: 12,
            width: "100%",
          }}
        />

        {/* Main content */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "60px 80px",
          }}
        >
          {/* Unofficial watermark */}
          <div
            style={{
              backgroundColor: "#dc2626",
              color: "#ffffff",
              fontSize: 18,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 6,
              marginBottom: 24,
            }}
          >
            非公式
          </div>

          {/* Page title */}
          <div
            style={{
              fontSize: displayTitle.length > 20 ? 52 : 64,
              fontWeight: 800,
              color: "#1e293b",
              lineHeight: 1.2,
              maxWidth: 900,
            }}
          >
            {displayTitle}
          </div>

          {/* Site subtitle */}
          <div
            style={{
              fontSize: 28,
              color: "#64748b",
              marginTop: 20,
            }}
          >
            江東区の生活情報 — 非公式サービス
          </div>
        </div>

        {/* Footer attribution */}
        <div
          style={{
            backgroundColor: "#e2e8f0",
            padding: "16px 80px",
            fontSize: 16,
            color: "#475569",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Based on data by 東京都・江東区 (CC-BY 4.0)</span>
          <span style={{ fontWeight: 600 }}>My こうとう (非公式)</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
