import { redirect } from "next/navigation";

export default async function LegacyMiniCheckpointPage({ params, searchParams }: {
  params: Promise<{ level: string; chapter: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { level, chapter } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach(item => query.append(key, item));
    else if (value !== undefined) query.append(key, value);
  }
  const suffix = query.size ? `?${query}` : "";
  redirect(`/learn/${encodeURIComponent(level)}/${encodeURIComponent(chapter)}/mini-checkpoint${suffix}`);
}
