import { redirect } from "next/navigation";

export default async function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/blog/article?slug=${encodeURIComponent(slug)}`);
}
