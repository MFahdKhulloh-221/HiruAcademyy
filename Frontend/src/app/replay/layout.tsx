"use client";

import type { ReactNode } from "react";
import { JourneyShell } from "@/components/journey-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useLearningCatalog } from "@/components/learning-hooks";
import { learningMembership } from "@/lib/learning-api";

export default function ReplayLayout({ children }: { children: ReactNode }) {
  const request = useLearningCatalog();
  if (!request.data) return request.error ? <main className="supporting-main"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></main> : <LoadingSkeleton variant="cards" />;
  return <JourneyShell membership={learningMembership(request.data.access)}>{children}</JourneyShell>;
}
