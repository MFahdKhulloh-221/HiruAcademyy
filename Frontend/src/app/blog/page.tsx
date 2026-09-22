"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PublicPage } from "@/components/public-shell";
import { blogArticles, blogDetailSlug, blogFeatured } from "@/lib/public-mock";
import { usePublishedArticles } from "@/lib/website-store";

function ArticleMeta({ category, author, publishedAt }: { category: string; author: string; publishedAt: string }) {
  return <div className="blog-meta"><span>{category}</span><small>{author} • {publishedAt}</small></div>;
}

export default function BlogPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const published = usePublishedArticles();

  const { featured, allArticles, categories } = useMemo(() => {
    const adminArticles = published.map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      description: a.summary,
      category: a.category,
      author: a.author,
      publishedAt: a.publishedAt
        ? new Date(a.publishedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
        : a.updatedAt,
      imageUrl: "",
      href: `/blog/article?slug=${encodeURIComponent(a.slug)}`,
    }));

    const matchedAdminFeatured = adminArticles.find((a) => a.slug === blogDetailSlug);
    const activeFeatured = matchedAdminFeatured
      ? {
          label: "ARTIKEL UNGGULAN",
          category: matchedAdminFeatured.category,
          author: matchedAdminFeatured.author,
          publishedAt: matchedAdminFeatured.publishedAt,
          title: matchedAdminFeatured.title,
          description: matchedAdminFeatured.description,
          imageUrl: "",
          href: matchedAdminFeatured.href,
          slug: matchedAdminFeatured.slug,
        }
      : {
          ...blogFeatured,
          imageUrl: "",
          href: `/blog/${blogDetailSlug}`,
        };

    const fixtureList = blogArticles.map((a, idx) => ({
      id: `fixture-${idx}`,
      title: a.title,
      slug: blogDetailSlug,
      description: a.description,
      category: a.category,
      author: a.author,
      publishedAt: a.publishedAt,
      imageUrl: "",
      href: `/blog/${blogDetailSlug}`,
    }));

    const seenSlugs = new Set<string>();
    const seenTitles = new Set<string>();

    if (activeFeatured.slug) seenSlugs.add(activeFeatured.slug.toLowerCase());
    seenTitles.add(activeFeatured.title.toLowerCase());

    const gridArticles: typeof adminArticles = [];

    for (const art of adminArticles) {
      const slugKey = art.slug.toLowerCase();
      const titleKey = art.title.toLowerCase();
      if (!seenSlugs.has(slugKey) && !seenTitles.has(titleKey)) {
        seenSlugs.add(slugKey);
        seenTitles.add(titleKey);
        gridArticles.push(art);
      }
    }

    for (const fix of fixtureList) {
      const titleKey = fix.title.toLowerCase();
      if (!seenTitles.has(titleKey)) {
        seenTitles.add(titleKey);
        gridArticles.push(fix);
      }
    }

    const allCat = ["Semua", ...new Set([activeFeatured.category, ...gridArticles.map((a) => a.category)])];

    return {
      featured: activeFeatured,
      allArticles: gridArticles,
      categories: allCat,
    };
  }, [published]);

  const visibleArticles = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("id-ID");
    return allArticles.filter(
      (article) =>
        (category === "Semua" || article.category === category) &&
        (!search || `${article.title} ${article.description} ${article.category}`.toLocaleLowerCase("id-ID").includes(search))
    );
  }, [allArticles, category, query]);

  return (
    <PublicPage active="Blog">
      <main className="public-main blog-page">
        <section className="blog-hero">
          <div>
            <p className="kicker">HIRU INSIGHT</p>
            <h1>Panduan Bahasa Jepang dan Persiapan JLPT</h1>
            <p>Temukan penjelasan materi, strategi ujian, budaya Jepang, dan tips belajar praktis dari Hiru Academy.</p>
            <label className="blog-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Cari materi, level, atau topik"
                placeholder="Cari materi, level, atau topik"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="blog-featured">
          <div className="blog-featured-thumb" aria-label="Thumbnail Artikel Unggulan">
            {featured.imageUrl ? (
              <Image
                src={featured.imageUrl}
                alt={featured.title}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                style={{ objectFit: "cover" }}
              />
            ) : (
              <span>No Image</span>
            )}
          </div>
          <div className="blog-featured-content">
            <p className="kicker">{featured.label}</p>
            <ArticleMeta category={featured.category} author={featured.author} publishedAt={featured.publishedAt} />
            <h2>{featured.title}</h2>
            <p>{featured.description}</p>
            <Link className="button button-primary" href={featured.href}>
              Baca Artikel
            </Link>
          </div>
        </section>

        <section className="public-section blog-latest">
          <div className="public-section-head">
            <h2>Artikel terbaru</h2>
          </div>
          <div className="blog-filters" aria-label="Filter kategori">
            {categories.map((item) => (
              <button
                className={category === item ? "active" : ""}
                type="button"
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
                key={item}
              >
                {item}
              </button>
            ))}
          </div>
          {visibleArticles.length ? (
            <div className="blog-grid">
              {visibleArticles.map((article) => (
                <article className="blog-card" key={article.title}>
                  <div className="blog-card-thumb" aria-label={`Thumbnail ${article.title}`}>
                    {article.imageUrl ? (
                      <Image
                        src={article.imageUrl}
                        alt={article.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        style={{ objectFit: "cover" }}
                      />
                    ) : (
                      <span>No Image</span>
                    )}
                  </div>
                  <div className="blog-card-body">
                    <ArticleMeta category={article.category} author={article.author} publishedAt={article.publishedAt} />
                    <h3>{article.title}</h3>
                    <p>{article.description}</p>
                    <Link className="button button-outline" href={article.href}>
                      Baca Artikel
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="blog-empty">Artikel tidak ditemukan.</p>
          )}
        </section>

        <section className="blog-cta">
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
      </main>
    </PublicPage>
  );
}
