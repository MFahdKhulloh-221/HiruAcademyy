import type { Metadata } from "next";
import { Suspense } from "react";
import { StaticStudentRoute } from "@/components/static-student-route";

export const metadata: Metadata = { title: "Learning Journey", description: "Chapter perjalanan belajar HIRU Academy.", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return ["dasar", "n5", "n4", "n3", "n2", "n1", "ssw-pengolahan-makanan", "interview"].map((level) => ({ level }));
}

export default async function JourneyPage({ params }: { params: Promise<{ level: string }> }) {
  const { level } = await params;
  return <Suspense><StaticStudentRoute kind="journey" level={level} /></Suspense>;
}
