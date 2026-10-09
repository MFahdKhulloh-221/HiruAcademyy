import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { LearningDashboard } from "@/components/learning-dashboard";

export const metadata: Metadata = { title: "Dashboard", description: "Dashboard belajar HIRU Academy.", robots: { index: false, follow: false } };

export default function DashboardPage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="dashboard" /></main>}><LearningDashboard /></Suspense>;
}
