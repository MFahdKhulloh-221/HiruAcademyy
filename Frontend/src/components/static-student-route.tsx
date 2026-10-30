"use client";

import { useCallback } from "react";
import { StudentLoading } from "@/components/loading-skeleton";
import { ChapterAssessment } from "@/components/chapter-assessment";
import { LearningDashboard } from "@/components/learning-dashboard";
import { LearningJourney } from "@/components/learning-journey";
import { LearningVertical } from "@/components/learning-vertical";
import { LearningShell } from "@/components/learning-shell";
import { loadChapterContext, useLearningCatalog, useLearningRequest } from "@/components/learning-hooks";
import { MiniCheckpointScreen } from "@/components/mini-checkpoint-screen";
import { ClassDetailScreen, ReplayPlayerScreen, ReplayScreen, ScheduleScreen } from "@/components/sensei-screens";
import { SenseiShell } from "@/components/sensei-shell";
import { SenseiTryoutScreen } from "@/components/sensei-tryout-screen";
import { StudentNavigation } from "@/components/student-navigation";
import { learningMembership } from "@/lib/learning-api";

type RouteKind = "dashboard" | "levels" | "journey" | "learning" | "video" | "grammar" | "kanji" | "flashcards" | "audio" | "reading" | "checkpoint" | "tryout" | "schedule" | "class-detail" | "replay" | "replay-player" | "mini";

export function StaticStudentRoute({ kind, level, chapter }: { kind: RouteKind; level?: string; chapter?: string }) {
  if (kind === "dashboard") return <LearningDashboard />;
  if (kind === "levels" || kind === "journey") return <LearningJourney level={kind === "journey" ? level : undefined} />;
  if (kind === "learning" || kind === "video" || kind === "grammar" || kind === "kanji" || kind === "flashcards") {
    return level && chapter ? <LearningVertical key={`${level}/${chapter}/${kind}`} kind={kind} level={level} chapter={chapter} /> : <LearningJourney />;
  }
  if (kind === "checkpoint" && !level && !chapter) return <StudentServiceRoute kind={kind} />;
  if (kind === "audio" || kind === "reading" || kind === "checkpoint") {
    return level && chapter ? <AssessmentRoute key={`${level}/${chapter}/${kind}`} kind={kind} level={level} chapter={chapter} /> : <LearningJourney />;
  }
  return <StudentServiceRoute kind={kind} />;
}

function AssessmentRoute({ kind, level, chapter }: { kind: "audio" | "reading" | "checkpoint"; level: string; chapter: string }) {
  const load = useCallback((signal: AbortSignal) => loadChapterContext(level, chapter, signal), [level, chapter]);
  const request = useLearningRequest(load, `${level}/${chapter}`);
  if (!request.data) return request.error ? <main className="learning-content"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></main> : <StudentLoading shell="learning" variant="assessment" label="Memuat…" />;
  return <LearningShell membership={learningMembership(request.data.access)} level={level} chapter={chapter} current={kind === "audio" ? "audio" : "reading"} breadcrumbLabel={kind === "checkpoint" ? "Mini Checkpoint" : kind === "audio" ? "Audio" : "Reading"}><ChapterAssessment context={request.data} level={level} chapterSlug={chapter} kind={kind === "checkpoint" ? "mini" : kind} /></LearningShell>;
}

function StudentServiceRoute({ kind }: { kind: RouteKind }) {
  const request = useLearningCatalog();
  if (!request.data) return request.error ? <main className="supporting-main"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></main> : <StudentLoading shell={(kind === "tryout" || kind === "checkpoint") ? "supporting" : "sensei"} variant={kind === "replay-player" ? "learning" : "cards"} label="Memuat…" />;
  const membership = learningMembership(request.data.access);
  if (kind === "tryout" || kind === "checkpoint") return <div className="supporting-shell student-shell"><StudentNavigation membership={membership} /><main className="supporting-main"><SenseiTryoutScreen membership={membership} kind={kind} /></main></div>;
  const breadcrumbs = kind === "class-detail" ? [{ label: "Jadwal", href: `/schedule?membership=${membership}` }, { label: "Chapter 4" }] : kind === "replay-player" ? [{ label: "Replay", href: `/replay?membership=${membership}` }, { label: "Chapter 4" }] : undefined;
  return <SenseiShell membership={membership} breadcrumbs={breadcrumbs}>
    {kind === "schedule" && <ScheduleScreen />}
    {kind === "class-detail" && <ClassDetailScreen />}
    {kind === "replay" && <ReplayScreen />}
    {kind === "replay-player" && <ReplayPlayerScreen />}
    {kind === "mini" && <MiniCheckpointScreen membership={membership} resolvedCatalog={request.data} />}
  </SenseiShell>;
}
