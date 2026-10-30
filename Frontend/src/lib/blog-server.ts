import "server-only";
import { cache } from "react";
import type { ArticleContent } from "./public-content-api";

export const blogOrigin = "https://hiruacademy.id";
export const blogUrl = (slug?: string) => `${blogOrigin}/blog${slug ? `/${encodeURIComponent(slug)}` : ""}`;
export const validBlogSlug = (slug: string) => slug.length <= 255 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

async function publicBlog(path: string) {
  const base = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error("API blog belum dikonfigurasi.");
  const url = new URL(`${base.replace(/\/+$/, "")}/api/blog${path}`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("URL API blog tidak valid.");
  // Public-only fetch. No cookies, admin credentials, or persistent cache of unpublished content.
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API blog gagal (${response.status}).`);
  return (await response.json()).data;
}
function isPublicArticle(article: ArticleContent): boolean {
  const publishedAt = article.published_at == null ? null : Date.parse(article.published_at);
  return article.published !== false && (publishedAt === null || (Number.isFinite(publishedAt) && publishedAt <= Date.now()));
}
export const getBlogArticles = cache(async (): Promise<ArticleContent[]> => {
  const data = await publicBlog("");
  if (!Array.isArray(data)) throw new Error("Respons daftar artikel tidak valid.");
  return data.filter(article => validBlogSlug(article.slug) && isPublicArticle(article));
});
export const getBlogArticle = cache(async (slug: string): Promise<ArticleContent | null> => {
  if (!validBlogSlug(slug)) return null;
  const article = await publicBlog(`/${encodeURIComponent(slug)}`);
  return article?.slug === slug && isPublicArticle(article) ? article : null;
});
export function publicBlogImage(article: ArticleContent): string | undefined {
  const value = article.thumbnail_resolved_url || article.thumbnail;
  if (!value) return undefined;
  try {
    const url = new URL(value, value.startsWith("/") ? blogOrigin : `${blogOrigin}/storage/`);
    if (url.protocol !== "https:" || url.hostname === "localhost" || url.hostname.endsWith(".localhost") || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) return undefined;
    return url.href;
  } catch { return undefined; }
}
export function blogDate(value?: string | null): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}
export function jsonLd(value: unknown) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
