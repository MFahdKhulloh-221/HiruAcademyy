"use client";

import { useSearchParams } from "next/navigation";
import { StudentLoading } from "@/components/loading-skeleton";
import { SupportingScreen } from "@/components/supporting-screen";
import { useLearningCatalog } from "@/components/learning-hooks";
import { learningMembership } from "@/lib/learning-api";
import type { SupportingKind } from "@/lib/supporting-mock";

export function SupportingRoute({ kind, breadcrumbCurrent }: { kind: SupportingKind; breadcrumbCurrent?: string }) {
  const searchParams = useSearchParams();
  const request = useLearningCatalog();
  if (!request.data) return request.error ? <main className="supporting-main"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></main> : <StudentLoading shell="supporting" variant={kind === "profile" ? "profile" : kind === "progress" || kind === "affiliate" ? "stats" : kind === "leaderboard" ? "ranking" : kind === "notifications" || kind === "community" ? "list" : kind === "createPost" || kind === "renewal" ? "form" : "cards"} label="Memuat…" />;
  return <SupportingScreen key={`${kind}/${searchParams.get("target") ?? ""}/${searchParams.get("invoice") ?? ""}`} kind={kind} membership={learningMembership(request.data.access)} access={request.data.access} programs={request.data.programs} breadcrumbCurrent={breadcrumbCurrent} targetProgram={searchParams.get("target") ?? undefined} invoiceId={searchParams.get("invoice") ?? undefined} />;
}
