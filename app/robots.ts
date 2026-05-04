import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.NODE_ENV === "production";

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
