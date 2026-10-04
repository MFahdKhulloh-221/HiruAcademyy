"use client";

import type { LearningData } from "@/lib/learning-mock";

export function ChapterCheckpoint({ data }: { data: LearningData }) {
  return <section className="learning-question-page checkpoint-page"><header className="learning-question-head"><p className="dash-kicker">{data.level} • CHAPTER {data.chapterNumber} • CHECKPOINT</p><h1>Uji pemahaman sebelum melanjutkan journey</h1></header><p role="status">OPEN: backend Checkpoint belum tersedia.</p></section>;
}
