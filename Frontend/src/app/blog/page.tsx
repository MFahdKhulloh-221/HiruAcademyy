"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PublicPage } from "@/components/public-shell";
import { contentMedia, useContent, type ArticleContent } from "@/lib/public-content-api";

export default function BlogPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const content = useContent<ArticleContent>("/api/blog");
  const featured = content.data.find(article => article.featured);
  const categories = ["Semua", ...new Set(content.data.map(article => article.category))];
  const visible = content.data.filter(article => (category === "Semua" || article.category === category) && `${article.title} ${article.excerpt ?? ""} ${article.category}`.toLocaleLowerCase("id-ID").includes(query.trim().toLocaleLowerCase("id-ID")));
  const thumbnail = (article: ArticleContent) => contentMedia(article.thumbnail) ? <Image unoptimized src={contentMedia(article.thumbnail)} alt={article.title} fill sizes="(max-width: 768px) 100vw, 50vw" style={{ objectFit: "cover" }} /> : <span>No Image</span>;
  const meta = (article: ArticleContent) => <div className="blog-meta"><span>{article.category}</span><small>{article.author}{article.published_at ? ` • ${new Date(article.published_at).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" })}` : ""}</small></div>;
  return <PublicPage active="Blog"><main className="public-main blog-page">
    <section className="blog-hero"><div><p className="kicker">HIRU INSIGHT</p><h1>Panduan Bahasa Jepang dan Persiapan JLPT</h1><p>Temukan penjelasan materi, strategi ujian, budaya Jepang, dan tips belajar praktis dari Hiru Academy.</p><label className="blog-search"><span aria-hidden="true">⌕</span><input aria-label="Cari materi, level, atau topik" placeholder="Cari materi, level, atau topik" value={query} onChange={event => setQuery(event.target.value)} /></label></div></section>
    {content.loading ? <p role="status">Memuat artikel…</p> : content.error ? <div role="alert">{content.error} <button type="button" onClick={content.reload}>Coba lagi</button></div> : null}
    {featured && <section className="blog-featured"><div className="blog-featured-thumb" aria-label="Thumbnail Artikel Unggulan">{thumbnail(featured)}</div><div className="blog-featured-content"><p className="kicker">ARTIKEL UNGGULAN</p>{meta(featured)}<h2>{featured.title}</h2><p>{featured.excerpt}</p><Link className="button button-primary" href={`/blog/${featured.slug}`}>Baca Artikel</Link></div></section>}
    <section className="public-section blog-latest"><div className="public-section-head"><h2>Artikel terbaru</h2></div><div className="blog-filters" aria-label="Filter kategori">{categories.map(item => <button type="button" className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div><div className="blog-grid">{visible.map(article => <article className="blog-card" key={article.id}><div className="blog-card-thumb">{thumbnail(article)}</div><div className="blog-card-body">{meta(article)}<h3>{article.title}</h3><p>{article.excerpt}</p><Link className="button button-outline" href={`/blog/${article.slug}`}>Baca Artikel</Link></div></article>)}</div>{!content.loading && !content.error && !visible.length && <p className="blog-empty">Artikel tidak ditemukan.</p>}</section>
    <section className="blog-cta"><div><h2>Belum Tahu Harus Mulai dari Level Mana?</h2><p>Kerjakan Placement Test gratis untuk mendapatkan analisis kemampuan dan rekomendasi level belajar yang sesuai.</p><small>20 soal • ±5–10 menit • Hasil langsung</small></div><div><Link className="button button-primary" href="/placement">Cek Level Gratis</Link><Link className="button blog-secondary" href="/program">Lihat Program &amp; Biaya</Link></div></section>
  </main></PublicPage>;
}
