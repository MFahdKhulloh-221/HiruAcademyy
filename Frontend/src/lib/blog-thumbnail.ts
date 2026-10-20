import { contentMedia } from "@/lib/public-content-api";

export function blogThumbnailFallback(slug: string): string {
  let hash = 0;
  for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `/blog/tamnel${hash % 4 + 1}.png`;
}

export function blogThumbnailSource(thumbnail: string | null | undefined, slug: string, resolved?: string | null): string {
  const fallback = blogThumbnailFallback(slug);
  const value = resolved || thumbnail;
  if (value && /^\/blog\/[a-z\d._/-]+$/i.test(value) && !value.includes("..")) return value;
  const source = contentMedia(thumbnail, resolved);
  if (!source) return fallback;
  const hostname = new URL(source).hostname.toLowerCase();
  return hostname === "localhost" || hostname.endsWith(".localhost") || /^127\./.test(hostname) || ["[::1]", "0.0.0.0", "[::ffff:7f00:1]"].includes(hostname) ? fallback : source;
}
