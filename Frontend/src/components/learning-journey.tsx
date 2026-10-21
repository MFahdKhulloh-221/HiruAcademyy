"use client";

import Link from "next/link";
import { StudentLoading } from "@/components/loading-skeleton";
import { useCallback } from "react";
import { JourneyShell } from "@/components/journey-shell";
import { ChapterJourney } from "@/components/chapter-journey";
import { LevelSelection } from "@/components/level-selection";
import { useLearningRequest } from "@/components/learning-hooks";
import { completionPercent, learningCatalog, learningChapters, learningMembership, learningProgress, programCode, programSlug } from "@/lib/learning-api";
import type { JourneyChapter, JourneyLevel } from "@/lib/journey-mock";

export function LearningJourney({ level }: { level?: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const catalog = await learningCatalog(signal);
    const levels: JourneyLevel[] = catalog.programs.map(program => {
      const access = catalog.access.learning[program.code];
      return { slug: programSlug(program.code), code: program.code.toUpperCase(), title: program.name, description: program.description ?? "", access: access === "full" ? "owned" : access === "preview" ? "freePreview" : "notPurchased", cohort: "none", progression: "available", statusLabel: access === "full" ? "LEVEL DIMILIKI" : access === "preview" ? "CHAPTER 1 TERSEDIA" : "TERKUNCI", actionLabel: access === "full" ? "Buka perjalanan" : access === "preview" ? "Buka Chapter 1" : "Upgrade Membership" };
    });
    const program = catalog.programs.find(item => (item.slug === level || item.code === programCode(level ?? "")));
    const chapters: JourneyChapter[] = !program ? [] : await Promise.all((await learningChapters(program.id, signal)).map(async chapter => {
      const locked = chapter.access === "locked" || chapter.access === "none";
      const progress = locked ? undefined : await learningProgress(program.id, chapter.id, signal);
      return { key: `chapter-${chapter.chapter_number}`, orderLabel: String(chapter.chapter_number).padStart(2, "0"), title: chapter.title, description: chapter.description ?? "", state: locked ? "entitlementLocked" as const : "available" as const, statusLabel: locked ? "Terkunci • Upgrade" : "Buka", progress: completionPercent(progress?.activities ?? {}), components: Object.entries(progress?.activities ?? {}).map(([label, activity]) => ({ label, weight: 0, complete: activity.complete })), checkpointUnlocked: progress?.mini_unlocked ?? false, href: locked ? undefined : `/learn/${programSlug(program.code)}/chapter-${chapter.chapter_number}` };
    }));
    return { levels, chapters, membership: learningMembership(catalog.access) };
  }, [level]);
  const request = useLearningRequest(load, `journey/${level ?? ""}`);
  if (!request.data) return request.error ? <main className="journey-content"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></main> : <StudentLoading shell="journey" variant={level ? "list" : "cards"} label="Memuat materi..." />;
  const selected = request.data.levels.find(item => item.slug === level);
  return <JourneyShell membership={request.data.membership} breadcrumbs={selected ? [{ label: "Perjalanan Level", href: `/journey?membership=${request.data.membership}` }, { label: selected.code }] : undefined}>{selected ? <ChapterJourney membership={request.data.membership} level={selected} chapters={request.data.chapters} /> : <LevelSelection membership={request.data.membership} levels={request.data.levels} />}{level && !selected && <Link href="/journey">Kembali ke Level</Link>}</JourneyShell>;
}
