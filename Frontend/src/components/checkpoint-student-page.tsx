"use client";

import { SenseiTryoutScreen } from "@/components/sensei-tryout-screen";
import { useLearningCatalog } from "@/components/learning-hooks";
import { StudentNavigation } from "@/components/student-navigation";
import { learningMembership } from "@/lib/learning-api";

export function CheckpointStudentPage() {
  const request = useLearningCatalog();
  return <div className="supporting-shell student-shell"><StudentNavigation membership={request.data ? learningMembership(request.data.access) : "free"} /><main className="supporting-main"><SenseiTryoutScreen kind="checkpoint" membership={request.data ? learningMembership(request.data.access) : "free"} /></main></div>;
}
