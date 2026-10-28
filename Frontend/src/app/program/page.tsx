import { Suspense } from "react";
import { PublicProgramCatalog } from "@/components/public-program-catalog";
import { PublicPage } from "@/components/public-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";

export default function ProgramPage() {
  return <Suspense fallback={<PublicPage active="Program"><main className="public-main program-page"><LoadingSkeleton variant="cards" label="Memuat program…" /></main></PublicPage>}><PublicProgramCatalog /></Suspense>;
}
