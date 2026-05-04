import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // Allow indexing only on Vercel production; block on preview / local dev.
  // VERCEL_ENV is "production" | "preview" | "development" on Vercel.
  // Outside Vercel, fall back to NODE_ENV.
  const isProduction =
    process.env.VERCEL_ENV === "production" ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");

  return {
    rules: {
      userAgent: "*",
      // Preview deployments should not be indexed
      allow: isProduction ? "/" : undefined,
      disallow: isProduction ? undefined : "/",
    },
    sitemap: isProduction ? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/sitemap.xml` : undefined,
  };
}
