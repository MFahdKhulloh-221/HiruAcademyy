import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/dashboard", "/checkout", "/invoice", "/profile"] }, sitemap: "https://hiruacademy.id/sitemap.xml" };
}
