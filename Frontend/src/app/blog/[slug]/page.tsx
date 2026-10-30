import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/public-shell";
import { BlogThumbnail } from "@/components/blog-thumbnail";
import { BlogReadingProgress } from "@/components/blog-reading-progress";
import { BlogArticleBody } from "@/components/blog-article-body";
import { parseArticleBody } from "@/lib/blog-parser";
import { getBlogArticle, getBlogArticles, blogDate, blogOrigin, blogUrl, jsonLd, publicBlogImage } from "@/lib/blog-server";
import "../editorial.css";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getBlogArticle((await params).slug);
  if (!article) notFound();
  const title = article.seo_title || article.title;
  const description = article.meta_description || article.excerpt || article.title;
  const image = publicBlogImage(article);
  const url = blogUrl(article.slug);
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "article", siteName: "HIRU Academy", locale: "id_ID", publishedTime: blogDate(article.published_at), authors: article.author ? [article.author] : undefined, images: image ? [{ url: image, alt: article.title }] : undefined }, twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined } };
}
export default async function BlogDetailPage({ params }: Props) {
  const article = await getBlogArticle((await params).slug);
  if (!article) notFound();
  const articles = await getBlogArticles();
  const related = articles.filter(item => item.slug !== article.slug && item.category === article.category).slice(0, 3);
  const headings = parseArticleBody(article.body).map((block, index) => ({ ...block, id: `section-${index + 1}` })).filter(block => block.type === "h2" || block.type === "h3");
  const published = blogDate(article.published_at);
  const categoryUrl = `${blogUrl()}?category=${encodeURIComponent(article.category)}`;
  const schema = [{ "@context": "https://schema.org", "@type": "BlogPosting", headline: article.title, description: article.meta_description || article.excerpt || article.title, image: publicBlogImage(article), datePublished: published, author: article.author ? { "@type": "Person", name: article.author } : undefined, publisher: { "@id": `${blogOrigin}/#organization` }, mainEntityOfPage: blogUrl(article.slug) }, { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ name: "Beranda", item: blogOrigin }, { name: "Blog", item: blogUrl() }, { name: article.category, item: categoryUrl }, { name: article.title, item: blogUrl(article.slug) }].map((item, index) => ({ "@type": "ListItem", position: index + 1, ...item })) }];
  return <PublicPage active="Blog"><main className="public-main editorial-blog"><div className="editorial-container"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} /><nav className="editorial-breadcrumb" aria-label="Breadcrumb"><Link href="/">Beranda</Link><span>/</span><Link href="/blog">Blog</Link><span>/</span><Link href={`/blog?category=${encodeURIComponent(article.category)}`}>{article.category}</Link><span>/</span><span aria-current="page">{article.title}</span></nav><header className="editorial-article-header"><p className="kicker">{article.category}</p><h1>{article.title}</h1>{article.excerpt && <p className="editorial-deck">{article.excerpt}</p>}<p className="editorial-byline">{article.author}{published && <> · <time dateTime={published}>{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(new Date(published))}</time></>}</p></header><div className="editorial-reader-layout"><article className="editorial-article"><div className="editorial-thumbnail"><BlogThumbnail article={article} priority sizes="(max-width: 767px) 100vw, 75vw" /></div><BlogArticleBody body={article.body} /><footer className="editorial-article-footer"><Link href="/blog">← Kembali ke Blog</Link></footer></article><aside className="editorial-sidebar" aria-label="Navigasi artikel"><BlogReadingProgress />{headings.length >= 2 && <nav aria-label="Daftar isi"><h2>Daftar isi</h2><ol>{headings.map(heading => <li key={heading.id} className={heading.type === "h3" ? "editorial-toc-sub" : undefined}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ol></nav>}{related.length > 0 && <section><h2>Artikel terkait</h2><ul>{related.map(item => <li key={item.slug}><Link href={`/blog/${item.slug}`}>{item.title}</Link></li>)}</ul></section>}<section><h2>Lanjutkan belajar</h2><p>Temukan program atau kenali level bahasa Jepangmu.</p><Link href="/program">Lihat program belajar ↗</Link><Link href="/placement">Coba Placement Test ↗</Link></section></aside></div></div></main></PublicPage>;
}
