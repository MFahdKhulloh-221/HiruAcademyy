"use client";

import { useCallback } from "react";
import { ChapterAssessment } from "@/components/chapter-assessment";
import { LearningDashboard } from "@/components/learning-dashboard";
import { LearningJourney } from "@/components/learning-journey";
import { LearningVertical } from "@/components/learning-vertical";
import { LearningShell } from "@/components/learning-shell";
import { loadChapterContext, useLearningCatalog, useLearningRequest } from "@/components/learning-hooks";
import { AskSenseiScreen } from "@/components/ask-sensei-screen";
import { MiniCheckpointScreen } from "@/components/mini-checkpoint-screen";
import { ClassDetailScreen, ReplayPlayerScreen, ReplayScreen, ScheduleScreen } from "@/components/sensei-screens";
import { SenseiShell } from "@/components/sensei-shell";
import { SenseiTryoutScreen } from "@/components/sensei-tryout-screen";
import { StudentNavigation } from "@/components/student-navigation";
import { learningMembership } from "@/lib/learning-api";

type RouteKind = "dashboard" | "levels" | "journey" | "learning" | "video" | "grammar" | "kanji" | "flashcards" | "audio" | "reading" | "checkpoint" | "tryout" | "schedule" | "class-detail" | "replay" | "replay-player" | "ask" | "mini";

export function StaticStudentRoute({ kind, level, chapter }: { kind: RouteKind; level?: string; chapter?: string }) {
  if (kind === "dashboard") return <LearningDashboard />;
  if (kind === "levels" || kind === "journey") return <LearningJourney level={kind === "journey" ? level : undefined} />;
  if (kind === "learning" || kind === "video" || kind === "grammar" || kind === "kanji" || kind === "flashcards") {
    return level && chapter ? <LearningVertical key={`${level}/${chapter}/${kind}`} kind={kind} level={level} chapter={chapter} /> : <LearningJourney />;
  }
  if (kind === "audio" || kind === "reading" || kind === "checkpoint") {
    return level && chapter ? <AssessmentRoute key={`${level}/${chapter}/${kind}`} kind={kind} level={level} chapter={chapter} /> : <LearningJourney />;
  }
  return <StudentServiceRoute kind={kind} />;
}

function AssessmentRoute({ kind, level, chapter }: { kind: "audio" | "reading" | "checkpoint"; level: string; chapter: string }) {
  const load = useCallback((signal: AbortSignal) => loadChapterContext(level, chapter, signal), [level, chapter]);
  const request = useLearningRequest(load, `${level}/${chapter}`);
  if (!request.data) return <main className="learning-content"><p role={request.error ? "alert" : "status"}>{request.error ?? "Memuat…"}</p>{request.error && <button type="button" onClick={request.retry}>Coba Lagi</button>}</main>;
  return <LearningShell membership={learningMembership(request.data.access)} level={level} chapter={chapter} current={kind === "audio" ? "audio" : "reading"} breadcrumbLabel={kind === "checkpoint" ? "Mini Checkpoint" : kind === "audio" ? "Audio" : "Reading"}><ChapterAssessment context={request.data} level={level} chapterSlug={chapter} kind={kind === "checkpoint" ? "mini" : kind} /></LearningShell>;
}

function StudentServiceRoute({ kind }: { kind: RouteKind }) {
  const request = useLearningCatalog();
  if (!request.data) return <main className="supporting-main"><p role={request.error ? "alert" : "status"}>{request.error ?? "Memuat…"}</p>{request.error && <button type="button" onClick={request.retry}>Coba Lagi</button>}</main>;
  const membership = learningMembership(request.data.access);
  if (kind === "tryout") return <div className="supporting-shell student-shell"><StudentNavigation membership={membership} /><main className="supporting-main"><SenseiTryoutScreen /></main></div>;
  const breadcrumbs = kind === "class-detail" ? [{ label: "Jadwal", href: `/schedule?membership=${membership}` }, { label: "Chapter 4" }] : kind === "replay-player" ? [{ label: "Replay", href: `/replay?membership=${membership}` }, { label: "Chapter 4" }] : undefined;
  return <SenseiShell membership={membership} breadcrumbs={breadcrumbs}>
    {kind === "schedule" && <ScheduleScreen />}
    {kind === "class-detail" && <ClassDetailScreen />}
    {kind === "replay" && <ReplayScreen />}
    {kind === "replay-player" && <ReplayPlayerScreen />}
    {kind === "mini" && <MiniCheckpointScreen membership={membership} />}
    {kind === "ask" && <AskSenseiScreen />}
  </SenseiShell>;
}
