import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { StaticStudentRoute } from "@/components/static-student-route";

export const metadata: Metadata = { title: "Mini Checkpoint", robots: { index: false, follow: false } };

export default function MiniCheckpointPage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="assessment" /></main>}><StaticStudentRoute kind="mini" /></Suspense>;
}
