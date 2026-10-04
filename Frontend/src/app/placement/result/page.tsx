"use client";

import { PublicPage } from "@/components/public-shell";
import { BackendAssessmentRunner } from "@/components/backend-assessment-runner";

export default function PlacementResultPage() {
  return <PublicPage active="Placement Test"><main className="public-main placement-result"><BackendAssessmentRunner path="/api/placement/attempts" domain="placement" title="Placement Test" /></main></PublicPage>;
}
