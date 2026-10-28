import { Suspense } from "react";
import { PublicProgramCatalog } from "@/components/public-program-catalog";
import { PublicPage } from "@/components/public-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";

export default async function ProgramDetailPage({ params }: { params: Promise<{ level: string }> }) {
  const { level } = await params;
  return <Suspense fallback={<PublicPage active="Program"><main className="public-main program-detail-page"><LoadingSkeleton variant="cards" label="Memuat program…" /></main></PublicPage>}><PublicProgramCatalog program={level} /></Suspense>;
}
