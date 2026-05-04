import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/og", () => {
  it("returns 200 with image content-type for default (no title)", async () => {
    const request = new Request("http://localhost:3000/api/og");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const contentType = response.headers.get("content-type");
    // ImageResponse returns image/png
    expect(contentType).toMatch(/image\//);
  });

  it("returns 200 with valid title parameter", async () => {
    const request = new Request(
      "http://localhost:3000/api/og?title=ごみ収集カレンダー",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const contentType = response.headers.get("content-type");
    expect(contentType).toMatch(/image\//);
  });

  it("returns 200 (default image) for invalid title", async () => {
    // Titles with special characters should fall back to default OG
    const request = new Request(
      "http://localhost:3000/api/og?title=<script>alert(1)</script>",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const contentType = response.headers.get("content-type");
    expect(contentType).toMatch(/image\//);
  });

  it("returns 200 for oversized title (falls back to default)", async () => {
    const longTitle = "あ".repeat(61);
    const request = new Request(
      `http://localhost:3000/api/og?title=${encodeURIComponent(longTitle)}`,
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});
