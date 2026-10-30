"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BlogThumbnail } from "./blog-thumbnail";
import type { ArticleContent } from "@/lib/public-content-api";

export function BlogMeta({ article }: { article: ArticleContent }) {
  const validDate = article.published_at && Number.isFinite(Date.parse(article.published_at));
  return <div className="editorial-meta"><span>{article.category}</span><span>{article.author}</span>{validDate && <time dateTime={article.published_at!}>{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(new Date(article.published_at!))}</time>}</div>;
}

export function BlogCatalog({ articles, page, featured }: { articles: ArticleContent[]; page: number; featured?: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const router = useRouter();
  const params = useSearchParams();
  const activeCategory = params.get("category") ?? category;
  const categories = ["Semua", ...new Set(articles.map(article => article.category))];
  const filtered = articles.filter(article => (activeCategory === "Semua" || article.category === activeCategory) && `${article.title} ${article.excerpt ?? ""} ${article.category}`.toLocaleLowerCase("id-ID").includes(query.trim().toLocaleLowerCase("id-ID")));
  const current = query || activeCategory !== "Semua" ? 1 : page;
  const pages = Math.ceil(filtered.length / 12);
  const visible = filtered.slice((current - 1) * 12, current * 12);
  return <>
    <header className="editorial-intro"><div className="editorial-intro-copy"><p className="kicker">HIRU INSIGHT</p><h1>Belajar Bahasa Jepang &amp; Persiapan JLPT</h1><p>Panduan grammar, kosakata, listening, strategi JLPT, dan tips belajar bahasa Jepang bersama HiruAcademy.</p></div><label className="editorial-search"><span>Cari artikel atau materi</span><input type="search" aria-label="Cari materi, level, atau topik" placeholder="Cari artikel atau materi…" value={query} onChange={event => setQuery(event.target.value)} /></label></header>
    {!query && activeCategory === "Semua" && page === 1 && featured}
    <section className="editorial-latest" aria-labelledby="latest-heading"><h2 id="latest-heading">Artikel terbaru</h2><div className="editorial-filters" aria-label="Filter kategori">{categories.map(item => <button type="button" aria-pressed={activeCategory === item} key={item} onClick={() => { setCategory(item); if (params.has("category")) router.replace("/blog", { scroll: false }); }}>{item}</button>)}</div><div className="editorial-grid">{visible.map(article => <article className="blog-card editorial-card" key={article.id}><Link className="editorial-thumbnail" href={`/blog/${article.slug}`} tabIndex={-1} aria-hidden="true"><BlogThumbnail article={article} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" /></Link><div className="editorial-card-body"><BlogMeta article={article} /><h3><Link href={`/blog/${article.slug}`}>{article.title}</Link></h3><p>{article.excerpt}</p><Link className="editorial-read" href={`/blog/${article.slug}`}>Baca Artikel <span aria-hidden="true">↗</span></Link></div></article>)}</div>{!visible.length && <p role="status">Artikel tidak ditemukan.</p>}{pages > 1 && <nav className="editorial-pagination" aria-label="Halaman artikel">{Array.from({ length: pages }, (_, index) => <Link key={index} href={`/blog?page=${index + 1}`} aria-current={current === index + 1 ? "page" : undefined}>{index + 1}</Link>)}</nav>}</section>
  </>;
}
