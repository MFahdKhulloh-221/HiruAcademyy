"use client";

import { accessibleJourney, DashboardJourneyRecommendation } from "./dashboard-journey-recommendation";
import { StudentLoading } from "@/components/loading-skeleton";
import { StudentDashboard } from "@/components/student-dashboard";
import { useAuth } from "@/components/auth-provider";
import { useLearningRequest } from "@/components/learning-hooks";
import { getDashboardData } from "@/lib/dashboard-mock";
import { completionPercent, learningDashboard, learningMembership, programSlug } from "@/lib/learning-api";

export function LearningDashboard() {
  const { user } = useAuth();
  const request = useLearningRequest(learningDashboard, "dashboard");
  if (!request.data) return request.error ? <main className="dash-content"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></main> : <StudentLoading shell="dashboard" variant="dashboard" label="Memuat materi..." />;
  const data = getDashboardData(learningMembership(request.data.catalog.access));
  const chapters = accessibleJourney(request.data);
  const next = chapters.find(item => Object.values(item.progress.activities).some(activity => !activity.complete) || (item.progress.mini_unlocked && !item.progress.mini_completed)) ?? chapters[0];
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
  const nextEntry = chapters.find(item => item.program.id === next?.program.id && item.chapter.chapter_number > next.chapter.chapter_number);
  return <StudentDashboard data={data} previewEnabled={false} practiceRecommendations={<DashboardJourneyRecommendation key={next?.chapter.id ?? "empty"} entry={next} nextEntry={nextEntry} />} />;
}
