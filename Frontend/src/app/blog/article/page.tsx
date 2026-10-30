import { notFound, permanentRedirect } from "next/navigation";
import { validBlogSlug } from "@/lib/blog-server";

export default async function LegacyArticlePage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const { slug } = await searchParams;
  if (!slug || !validBlogSlug(slug) || slug === "article") notFound();
  permanentRedirect(`/blog/${slug}`);
}
