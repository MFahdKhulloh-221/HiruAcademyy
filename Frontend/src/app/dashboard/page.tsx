import type { Metadata } from "next";
import { Suspense } from "react";
import { LearningDashboard } from "@/components/learning-dashboard";

export const metadata: Metadata = { title: "Dashboard", description: "Dashboard belajar HIRU Academy.", robots: { index: false, follow: false } };

export default function DashboardPage() {
  return <Suspense><LearningDashboard /></Suspense>;
}
