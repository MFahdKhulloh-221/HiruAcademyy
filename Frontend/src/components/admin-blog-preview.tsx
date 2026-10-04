"use client";

import Image from "next/image";
import { useState } from "react";
import { contentMedia } from "@/lib/public-content-api";

export type Article = { id: string; title: string; slug: string; excerpt: string; body: string; thumbnail: string; category: string; seoTitle: string; metaDescription: string; featured: boolean; published: boolean; publishedAt: string; author: string };

export function BlogThumbnail({ src, title, full = false }: { src: string; title: string; full?: boolean }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <Image src={contentMedia(src)} alt={`Thumbnail ${title}`} width={full ? 792 : 364} height={full ? 340 : 200} unoptimized className="admin-blog-preview-image" onError={() => setFailed(true)} /> : <span>{failed ? "Gambar tidak dapat dimuat" : "No Image"}</span>;
}

function ArticleMeta({ article, date }: { article: Article; date: string }) {
  return <div className="blog-meta"><span>{article.category}</span><small>{article.author} • {date}</small></div>;
}

export function AdminBlogCardPreview({ article, date, open }: { article: Article; date: string; open: () => void }) {
  return <article className="blog-card admin-blog-card-preview">
    <div className="blog-card-thumb"><BlogThumbnail key={article.thumbnail} src={article.thumbnail} title={article.title} /></div>
    <div className="blog-card-body"><ArticleMeta article={article} date={date} /><h3>{article.title}</h3><p>{article.excerpt}</p><button type="button" className="button button-outline" onClick={open}>Baca Artikel</button></div>
  </article>;
}

export function AdminBlogArticlePreview({ article, date }: { article: Article; date: string }) {
  return <div className="admin-blog-article-preview"><article className="blog-article">
    <header><ArticleMeta article={article} date={date} /><h1>{article.title}</h1><p>{article.excerpt}</p></header>
    <div className="blog-detail-thumb"><BlogThumbnail key={article.thumbnail} src={article.thumbnail} title={article.title} full /></div>
    <div className="blog-body admin-blog-preview-body">{article.body.split(/\r?\n\s*\r?\n/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
  </article></div>;
}
