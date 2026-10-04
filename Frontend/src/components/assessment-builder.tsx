"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminTryoutPrototype } from "@/components/admin-assessment-prototype";
import { AdminQuestionWorkspace } from "@/components/admin-question-workspace";
import { AdminTabs } from "@/components/admin-primitives";

const tabs = ["Audio", "Reading", "Mini Checkpoint", "Try Out"] as const;
export function AssessmentHub() {
  const [active, setActive] = useState<string>("Try Out");
  const navigation = <AdminTabs tabs={tabs} active={active} onChange={setActive} label="Bank Soal" />;
  return active === "Try Out" ? <AdminTryoutPrototype navigation={navigation} /> : <AdminQuestionWorkspace kind={active as "Audio" | "Reading" | "Mini Checkpoint"} navigation={navigation} />;
}
export function AssessmentTypeSelector() {
  const type = useSearchParams().get("type");
  return type === "mini" || type === "checkpoint" ? <AdminQuestionWorkspace kind="Mini Checkpoint" /> : type === "reading" || type === "practice" ? <AdminQuestionWorkspace kind="Reading" /> : type === "audio" ? <AdminQuestionWorkspace kind="Audio" /> : <AdminTryoutPrototype />;
}
