"use client";

import { ChapterAssessment } from "@/components/chapter-assessment";
import type { LearningData } from "@/lib/learning-mock";

export function LearningQuestionActivity({ data, variant }: { data: LearningData; variant: "audio" | "reading" }) {
  return <ChapterAssessment level={data.levelSlug} chapterSlug={data.chapterSlug} kind={variant} />;
}
