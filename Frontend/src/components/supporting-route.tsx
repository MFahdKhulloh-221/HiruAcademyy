"use client";

import { useSearchParams } from "next/navigation";
import { SupportingScreen } from "@/components/supporting-screen";
import { useLearningCatalog } from "@/components/learning-hooks";
import { learningMembership } from "@/lib/learning-api";
import type { SupportingKind } from "@/lib/supporting-mock";

export function SupportingRoute({ kind, breadcrumbCurrent }: { kind: SupportingKind; breadcrumbCurrent?: string }) {
  const searchParams = useSearchParams();
  const request = useLearningCatalog();
  if (!request.data) return <main className="supporting-main"><p role={request.error ? "alert" : "status"}>{request.error ?? "Memuat…"}</p>{request.error && <button type="button" onClick={request.retry}>Coba Lagi</button>}</main>;
  return <SupportingScreen key={`${kind}/${searchParams.get("target") ?? ""}/${searchParams.get("invoice") ?? ""}`} kind={kind} membership={learningMembership(request.data.access)} access={request.data.access} programs={request.data.programs} breadcrumbCurrent={breadcrumbCurrent} targetProgram={searchParams.get("target") ?? undefined} invoiceId={searchParams.get("invoice") ?? undefined} />;
}
