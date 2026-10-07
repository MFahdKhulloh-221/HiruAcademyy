"use client";

import { useCallback } from "react";
import { StudentDashboard } from "@/components/student-dashboard";
import { useAuth } from "@/components/auth-provider";
import { useLearningRequest } from "@/components/learning-hooks";
import { getDashboardData } from "@/lib/dashboard-mock";
import { completionPercent, learningCatalog, learningChapters, learningMembership, learningProgress, programSlug } from "@/lib/learning-api";

export function LearningDashboard() {
  const { user } = useAuth();
  const load = useCallback(async (signal: AbortSignal) => {
    const catalog = await learningCatalog(signal);
    const programs = await Promise.all(catalog.programs.map(async program => {
      const chapters = await learningChapters(program.id, signal);
      return Promise.all(chapters.filter(chapter => !["locked", "none"].includes(chapter.access)).map(async chapter => ({ program, chapter, progress: await learningProgress(program.id, chapter.id, signal) })));
    }));
    return { catalog, chapters: programs.flat() };
  }, []);
  const request = useLearningRequest(load, "dashboard");
  if (!request.data) return <main className="dash-content"><p role={request.error ? "alert" : "status"}>{request.error ?? "Memuat materi..."}</p>{request.error && <button type="button" onClick={request.retry}>Coba Lagi</button>}</main>;
  const data = getDashboardData(learningMembership(request.data.catalog.access));
  const chapters = request.data.chapters;
  const next = chapters.find(item => Object.values(item.progress.activities).some(activity => !activity.complete)) ?? chapters[0];
  const activities = chapters.filter(item => item.program.id === next?.program.id).flatMap(item => Object.values(item.progress.activities));
  const percent = completionPercent(Object.fromEntries(activities.map((activity, index) => [index, activity])));
  data.config.target = user?.target_jlpt ? `Target JLPT: ${user.target_jlpt}` : "—";
  data.config.level = next?.program.name ?? "—";
  data.config.continue.title = next?.chapter.title ?? "Belum tersedia";
  data.config.continue.description = next?.chapter.description ?? "";
  data.config.continue.primaryHref = next ? `/learn/${programSlug(next.program.code)}/chapter-${next.chapter.chapter_number}` : "/journey";
  data.config.continue.progressLabel = `Progres ${next?.program.name ?? "—"}`;
  data.config.continue.progress = `${percent}%`;
  data.config.continue.progressPercent = percent;
  data.config.continue.detail = `${chapters.reduce((sum, item) => sum + (item.progress.activities.module?.completed ?? 0), 0)} modul`;
  return <StudentDashboard data={data} previewEnabled={false} />;
}
