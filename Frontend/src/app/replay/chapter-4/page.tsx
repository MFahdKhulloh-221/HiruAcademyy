import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { ReplayPlayerScreen } from "@/components/sensei-screens";

export const metadata: Metadata = { title: "Pemutar Replay", robots: { index: false, follow: false } };

export default function ReplayPlayerPage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="learning" /></main>}><ReplayPlayerScreen /></Suspense>;
}
