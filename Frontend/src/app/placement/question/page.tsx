"use client";

import { BackendAssessmentRunner } from "@/components/backend-assessment-runner";

export default function PlacementQuestionPage() {
  return <main className="placement-assessment"><BackendAssessmentRunner path="/api/placement/attempts" domain="placement" title="Placement Test" className="placement-assessment" /></main>;
}
