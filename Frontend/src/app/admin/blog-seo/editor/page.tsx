import { AdminBlogPrototype } from "@/components/admin-blog-prototype";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <AdminBlogPrototype editorId={id || "new"} />;
}
