import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PublicPage } from "@/components/public-shell";
import { BlogCatalog, BlogMeta } from "@/components/blog-catalog";
import { BlogThumbnail } from "@/components/blog-thumbnail";
import { getBlogArticles, blogUrl } from "@/lib/blog-server";
import "./editorial.css";

export const metadata: Metadata = {
  title: "Belajar Bahasa Jepang & Persiapan JLPT",
  description: "Panduan grammar, kosakata, listening, strategi JLPT, dan tips belajar bahasa Jepang bersama HiruAcademy.",
  alternates: { canonical: blogUrl() },
  openGraph: { title: "Belajar Bahasa Jepang & Persiapan JLPT", description: "Panduan belajar bahasa Jepang bersama HiruAcademy.", url: blogUrl(), type: "website", locale: "id_ID" },
};
export default async function BlogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [articles, search] = await Promise.all([getBlogArticles(), searchParams]);
  const page = Math.max(1, Math.min(Math.ceil(articles.length / 12) || 1, Number.parseInt(search.page ?? "1", 10) || 1));
  const featured = articles.find(article => article.featured);
  return <PublicPage active="Blog"><main className="public-main editorial-blog"><div className="editorial-container"><Suspense><BlogCatalog articles={articles} page={page} featured={featured && <section className="editorial-featured" aria-label="Artikel unggulan"><Link className="editorial-thumbnail" href={`/blog/${featured.slug}`}><BlogThumbnail article={featured} priority /></Link><div><p className="kicker">ARTIKEL UNGGULAN</p><BlogMeta article={featured} /><h2><Link href={`/blog/${featured.slug}`}>{featured.title}</Link></h2><p>{featured.excerpt}</p><Link className="editorial-read" href={`/blog/${featured.slug}`}>Baca Artikel <span aria-hidden="true">↗</span></Link></div></section>} /></Suspense><section className="final-cta"><div className="cta-panel"><div className="cta-pattern" aria-hidden="true">あ <span>日</span> 語</div><h2>Belum Tahu Harus Mulai dari Level Mana?</h2><p>Kerjakan Placement Test gratis untuk mendapatkan analisis kemampuan dan rekomendasi level belajar yang sesuai.</p><div className="editorial-cta-actions"><Link className="button button-primary" href="/placement">Cek Level Gratis<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></Link><Link className="button button-secondary" href="/program">Lihat Program &amp; Biaya</Link></div></div></section></div></main></PublicPage>;
}
