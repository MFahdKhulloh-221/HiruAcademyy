import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { StaticStudentRoute } from "@/components/static-student-route";

export const metadata: Metadata = { title: "Tanya Sensei", robots: { index: false, follow: false } };

export default function AskSenseiPage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="form" /></main>}><StaticStudentRoute kind="ask" /></Suspense>;
}
