"use client";

import Image from "next/image";
import { useState } from "react";
import { blogThumbnailFallback, blogThumbnailSource } from "@/lib/blog-thumbnail";

export function BlogThumbnail({ article, sizes = "(max-width: 768px) 100vw, 50vw", priority = false }: { article: { slug: string; title: string; thumbnail: string | null; thumbnail_resolved_url?: string | null }; sizes?: string; priority?: boolean }) {
  const source = blogThumbnailSource(article.thumbnail, article.slug, article.thumbnail_resolved_url);
  const fallback = blogThumbnailFallback(article.slug);
  const [failedSource, setFailedSource] = useState("");
  const src = failedSource === source ? fallback : source;
  return <Image unoptimized src={src} alt={src === fallback ? `HIRU Academy — ${article.title}` : article.title} fill priority={priority} sizes={sizes} style={{ objectFit: src === fallback ? "contain" : "cover", padding: src === fallback ? "12%" : undefined, background: src === fallback ? "#fff" : undefined }} onError={src === fallback ? undefined : () => setFailedSource(source)} />;
}
