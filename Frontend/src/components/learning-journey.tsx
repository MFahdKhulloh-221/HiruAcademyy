"use client";

import Link from "next/link";
import { StudentLoading } from "@/components/loading-skeleton";
import { useCallback } from "react";
import { JourneyShell } from "@/components/journey-shell";
import { ChapterJourney } from "@/components/chapter-journey";
import { apiRequest } from "@/lib/api";
import { chapterAttemptPath, type ServerAttempt } from "@/lib/assessment-attempt";
import { LevelSelection } from "@/components/level-selection";
import { useLearningRequest } from "@/components/learning-hooks";
import { completionPercent, learningCatalog, learningChapter, learningChapters, learningMembership, learningProgress, programCode, programSlug } from "@/lib/learning-api";
import type { JourneyChapter, JourneyLevel } from "@/lib/journey-mock";

export function LearningJourney({ level }: { level?: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const catalog = await learningCatalog(signal);
    const levels: JourneyLevel[] = catalog.programs.map(program => {
      const access = catalog.access.learning[program.code];
      return { slug: programSlug(program.code), code: program.family === "ssw" ? "SSW" : program.code.toUpperCase(), title: program.name, description: program.description ?? "", access: access === "full" ? "owned" : access === "preview" ? "freePreview" : "notPurchased", cohort: "none", progression: "available", statusLabel: access === "full" ? "PROGRAM DIMILIKI" : access === "preview" ? "CHAPTER 1 TERSEDIA" : "TERKUNCI", actionLabel: access === "full" ? "Buka perjalanan" : access === "preview" ? "Buka Chapter 1" : "Upgrade Membership" };
    });
    const program = catalog.programs.find(item => (item.slug === level || item.code === programCode(level ?? "")));
    const chapters: JourneyChapter[] = !program ? [] : await Promise.all((await learningChapters(program.id, signal)).map(async chapter => {
      const locked = chapter.access === "locked" || chapter.access === "none";
      const progress = locked ? undefined : await learningProgress(program.id, chapter.id, signal);
      const includeMini = chapter.mini_checkpoint?.exists === true && progress?.mini_eligible === true && ["n5", "n4", "n3", "n2"].includes(program.code.toLowerCase());
      let checkpointLabel: string | undefined;
      if (includeMini) {
        if (progress?.mini_completed) checkpointLabel = "Selesai";
        else if (!progress?.mini_unlocked) checkpointLabel = "Terkunci";
        else {
          try {
            const [detail, current] = await Promise.all([
              learningChapter(program.id, chapter.id, signal),
              apiRequest<{ data: ServerAttempt | null }>(`${chapterAttemptPath(program.id, chapter.id)}/current?kind=mini`, { signal }),
            ]);
            const groups = detail.mini_checkpoints ?? [];
            checkpointLabel = current.data?.status === "in_progress" ? "Sedang dikerjakan" : groups.length > 0 && groups.every(group => group.configuration_valid) ? "Siap dikerjakan" : "Sedang disiapkan";
          } catch (cause) {
            if (signal.aborted) throw cause;
            checkpointLabel = "Status belum dapat dimuat";
          }
        }
      }
      const chapterActivities = { ...progress?.activities, ...(includeMini ? { mini: { total: 1, completed: progress?.mini_completed ? 1 : 0, complete: progress?.mini_completed === true } } : {}) };
      const activities = Object.values(chapterActivities);
      const required = activities.filter(activity => activity.total > 0);
      const state = locked ? "entitlementLocked" as const : required.length > 0 && required.every(activity => activity.complete) ? "completed" as const : activities.some(activity => activity.completed > 0) ? "current" as const : "available" as const;
      return { key: `chapter-${chapter.chapter_number}`, orderLabel: String(chapter.chapter_number).padStart(2, "0"), title: chapter.title, description: chapter.description ?? "", state, statusLabel: state === "completed" ? "Selesai" : state === "current" ? "Sedang berjalan" : locked ? "Terkunci" : "Belum dimulai", progress: completionPercent(chapterActivities), components: Object.entries(chapterActivities).map(([label, activity]) => ({ label, weight: 0, complete: activity.complete })), checkpointUnlocked: progress?.mini_unlocked ?? false, checkpointLabel, href: locked ? undefined : `/learn/${programSlug(program.code)}/chapter-${chapter.chapter_number}` };
    }));
    return { levels, chapters, programId: program?.id, membership: learningMembership(catalog.access) };
  }, [level]);
  const request = useLearningRequest(load, `journey/${level ?? ""}`);
  if (!request.data) return request.error ? <main className="journey-content"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></main> : <StudentLoading shell="journey" variant={level ? "list" : "cards"} label="Memuat materi..." />;
  const selected = request.data.levels.find(item => item.slug === level);
  return <JourneyShell membership={request.data.membership}>{selected ? <><ChapterJourney key={request.data.programId} programId={request.data.programId} membership={request.data.membership} level={selected} chapters={request.data.chapters} /></> : <LevelSelection membership={request.data.membership} levels={request.data.levels} />}{level && !selected && <Link href="/journey">Kembali ke Program</Link>}</JourneyShell>;
}
