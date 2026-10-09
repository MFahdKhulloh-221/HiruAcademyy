import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { StaticStudentRoute } from "@/components/static-student-route";

export const metadata: Metadata = { title: "Pemutar Replay", robots: { index: false, follow: false } };

export default function ReplayPlayerPage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="learning" /></main>}><StaticStudentRoute kind="replay-player" /></Suspense>;
}
