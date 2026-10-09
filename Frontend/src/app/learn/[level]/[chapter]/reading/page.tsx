import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { StaticStudentRoute } from "@/components/static-student-route";

export const metadata: Metadata = { title: "Reading Question", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return ["dasar", "n5", "n4", "n3", "n2", "n1"].flatMap((level) => ["chapter-1", "chapter-2", "chapter-3", "chapter-4"].map((chapter) => ({ level, chapter })));
}

export default async function ReadingPage({ params }: { params: Promise<{ level: string; chapter: string }> }) {
  const { level, chapter } = await params;
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="assessment" /></main>}><StaticStudentRoute kind="reading" level={level} chapter={chapter} /></Suspense>;
}
