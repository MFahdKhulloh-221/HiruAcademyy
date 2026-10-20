import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { PublicPage } from "@/components/public-shell";
import { ArticleReader } from "../article/page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cleanSlug = typeof slug === "string" ? slug.trim() : "";
  const fallbackTitle = cleanSlug
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  try {
    const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
    if (base && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
      const res = await fetch(`${base}/api/blog/${encodeURIComponent(cleanSlug)}`, {
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const json = await res.json();
        const article = json?.data;
        if (article) {
          const title = article.seo_title || article.title || fallbackTitle;
          const description =
            article.meta_description ||
            article.excerpt ||
            "Panduan Bahasa Jepang dan Persiapan JLPT di HIRU Academy.";
          const image =
            article.thumbnail_resolved_url ||
            (article.thumbnail && !article.thumbnail.startsWith("http")
              ? `${base}/storage/${article.thumbnail.replace(/^\/+/, "")}`
              : article.thumbnail) ||
            "/brand/hiru-bawah.png";

          return {
            title,
            description,
            alternates: {
              canonical: `/blog/${cleanSlug}`,
            },
            openGraph: {
              title,
              description,
              url: `/blog/${cleanSlug}`,
              siteName: "HIRU Academy",
              locale: "id_ID",
              type: "article",
              publishedTime: article.published_at || undefined,
              authors: article.author ? [article.author] : ["Hiru Academy"],
              images: [
                {
                  url: image,
                  width: 1200,
                  height: 630,
                  alt: title,
                },
              ],
            },
            twitter: {
              card: "summary_large_image",
              title,
              description,
              images: [image],
            },
          };
        }
      }
    }
  } catch {
    // Fallback if API is unavailable during SSR/build
  }

  return {
    title: fallbackTitle,
    description: "Panduan Bahasa Jepang dan Persiapan JLPT di HIRU Academy.",
    alternates: {
      canonical: `/blog/${cleanSlug}`,
    },
    openGraph: {
      title: fallbackTitle,
      description: "Panduan Bahasa Jepang dan Persiapan JLPT di HIRU Academy.",
      url: `/blog/${cleanSlug}`,
      siteName: "HIRU Academy",
      locale: "id_ID",
      type: "article",
      images: [
        {
          url: "/brand/hiru-bawah.png",
          width: 1200,
          height: 630,
          alt: fallbackTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fallbackTitle,
      description: "Panduan Bahasa Jepang dan Persiapan JLPT di HIRU Academy.",
      images: ["/brand/hiru-bawah.png"],
    },
  };
}

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <Suspense
      fallback={
        <PublicPage active="Blog">
          <main className="public-main blog-detail-page">
            <LoadingSkeleton variant="article" label="Memuat artikel…" />
          </main>
        </PublicPage>
      }
    >
      <ArticleReader requestedSlug={slug} />
    </Suspense>
  );
}
