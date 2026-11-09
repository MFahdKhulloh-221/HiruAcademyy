import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { ReplayScreen } from "@/components/sensei-screens";

export const metadata: Metadata = { title: "Replay Kelas", robots: { index: false, follow: false } };

export default function ReplayPage() {
  return <Suspense fallback={<main className="public-main"><LoadingSkeleton variant="cards" /></main>}><ReplayScreen /></Suspense>;
}
