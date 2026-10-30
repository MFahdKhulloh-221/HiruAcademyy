import type { MetadataRoute } from "next";
import { getBlogArticles, blogDate, blogUrl } from "@/lib/blog-server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getBlogArticles().catch(error => {
    console.error("Sitemap blog: API unavailable", error instanceof Error ? error.name : "UnknownError");
    return [];
  });
  return [{ url: blogUrl() }, ...articles.map(article => ({ url: blogUrl(article.slug), ...(blogDate(article.published_at) ? { lastModified: blogDate(article.published_at) } : {}) }))];
}
