import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { StaticStudentRoute } from "@/components/static-student-route";

export const metadata: Metadata = { title: "Detail Kelas", robots: { index: false, follow: false } };

export default function ClassDetailPage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="article" /></main>}><StaticStudentRoute kind="class-detail" /></Suspense>;
}
