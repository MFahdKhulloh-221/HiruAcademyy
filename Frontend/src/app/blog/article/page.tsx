"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PublicPage } from "@/components/public-shell";
import { contentMedia, useContent, type ArticleContent } from "@/lib/public-content-api";
import type { ArticleBlock } from "@/lib/admin-website-store";

function renderBlock(block: ArticleBlock) {
  switch (block.type) {
    case "paragraph":
      return <p key={block.id}>{block.text}</p>;
    case "h2":
      return <h2 key={block.id}>{block.text}</h2>;
    case "h3":
      return <h3 key={block.id}>{block.text}</h3>;
    case "bulleted-list":
      return (
        <ul key={block.id}>
          {block.items?.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    case "numbered-list":
      return (
        <ol key={block.id}>
          {block.items?.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      );
    case "link":
      return (
        <p key={block.id}>
          <a
            href={block.url || "#"}
            rel="noopener noreferrer"
            style={{ color: "var(--orange-dark)", textDecoration: "underline" }}
            target="_blank"
          >
            {block.text || block.url}
          </a>
        </p>
      );
    case "image":
      return (
        <figure key={block.id} style={{ margin: "24px 0" }}>
          {block.url ? (
            <div style={{ position: "relative", width: "100%", height: "340px", borderRadius: "16px", overflow: "hidden" }}>
              <Image alt={block.alt || "Gambar artikel"} fill src={block.url} style={{ objectFit: "cover" }} />
            </div>
          ) : null}
          {block.caption && (
            <figcaption style={{ marginTop: "8px", fontSize: "14px", color: "var(--muted)", textAlign: "center" }}>
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    default:
      return null;
  }
}

export function ArticleReader({ requestedSlug }: { requestedSlug?: string }) {
  const searchParams = useSearchParams();
  const slug = requestedSlug ?? searchParams.get("slug") ?? "";
  const content = useContent<ArticleContent>(`/api/blog/${/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "invalid-slug"}`, true);
  const found = content.data.find(item => item.slug === slug);
  const article = found ? { ...found, summary: found.excerpt ?? "", imageUrl: contentMedia(found.thumbnail), imageAlt: found.title, publishedAt: found.published_at, updatedAt: "", blocks: found.body.split(/\n\s*\n/).map((text, index) => ({ id: String(index), type: "paragraph" as const, text })) } : undefined;
  if (content.loading || content.error) return <PublicPage active="Blog"><main className="public-main blog-detail-page">{content.loading ? <p role="status">Memuat artikel…</p> : <div role="alert">{content.error} <button type="button" onClick={content.reload}>Coba lagi</button></div>}</main></PublicPage>;

  if (!article) {
    return (
      <PublicPage active="Blog">
        <main className="public-main blog-detail-page">
          <div className="blog-detail-layout">
            <article className="blog-article">
              <header>
                <p className="kicker">HIRU INSIGHT</p>
                <h1>Artikel Tidak Ditemukan</h1>
                <p>Artikel dengan slug tersebut tidak ditemukan atau belum dipublikasikan.</p>
              </header>
              <div style={{ marginTop: "24px" }}>
                <Link className="button button-primary" href="/blog">
                  Kembali ke Blog
                </Link>
              </div>
            </article>
          </div>
        </main>
      </PublicPage>
    );
  }

  const formattedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : article.updatedAt;

  return (
    <PublicPage active="Blog">
      <main className="public-main blog-detail-page">
        <div className="blog-detail-layout">
          <article className="blog-article">
            <header>
              <p className="kicker">HIRU INSIGHT</p>
              <div className="blog-meta">
                <span>{article.category}</span>
                <small>{article.author} • {formattedDate}</small>
              </div>
              <h1>{article.title}</h1>
              {article.summary && <p>{article.summary}</p>}
            </header>

            {article.imageUrl ? (
              <div className="blog-detail-thumb" aria-label={`Thumbnail ${article.title}`}>
                <Image
                  alt={article.imageAlt || article.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 840px"
                  src={article.imageUrl}
                  style={{ objectFit: "cover" }}
                />
              </div>
            ) : (
              <div className="blog-detail-thumb" aria-label="Thumbnail Artikel">
                <span>No Image</span>
              </div>
            )}

            <div className="blog-body">
              {article.blocks && article.blocks.length > 0 ? (
                article.blocks.map(renderBlock)
              ) : (
                <p>{article.summary}</p>
              )}
            </div>

            <section className="blog-cta blog-detail-cta">
              <div>
                <h2>Belum Tahu Harus Mulai dari Level Mana?</h2>
                <p>
                  Kerjakan Placement Test gratis untuk mendapatkan analisis kemampuan dan rekomendasi level belajar yang sesuai.
                </p>
                <small>20 soal • ±5–10 menit • Hasil langsung</small>
              </div>
              <div>
                <Link className="button button-primary" href="/placement">
                  Cek Level Gratis
                </Link>
                <Link className="button blog-secondary" href="/program">
                  Lihat Program &amp; Biaya
                </Link>
              </div>
            </section>
          </article>

          <aside className="blog-sidebar">
            <section>
              <h2>Progress membaca</h2>
              <div className="reading-progress">
                <strong>100% selesai</strong>
                <i><b style={{ width: "100%" }} /></i>
              </div>
            </section>
            <section>
              <h2>Topik terkait</h2>
              <ul>
                <li>{article.category}</li>
                <li>Materi Belajar</li>
                <li>Persiapan JLPT</li>
              </ul>
            </section>
            <Link className="button button-dark" href="/blog">
              Kembali ke Blog
            </Link>
          </aside>
        </div>
      </main>
    </PublicPage>
  );
}

export default function BlogArticlePage() {
  return (
    <Suspense
      fallback={
        <PublicPage active="Blog">
          <main className="public-main blog-detail-page">
            <div className="blog-detail-layout">
              <p>Memuat artikel...</p>
            </div>
          </main>
        </PublicPage>
      }
    >
      <ArticleReader />
    </Suspense>
  );
}
