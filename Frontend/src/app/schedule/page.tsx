import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { StaticStudentRoute } from "@/components/static-student-route";

export const metadata: Metadata = { title: "Jadwal Kelas", robots: { index: false, follow: false } };

export default function SchedulePage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="list" /></main>}><StaticStudentRoute kind="schedule" /></Suspense>;
}
