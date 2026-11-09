import { learningDashboard, programSlug } from "@/lib/learning-api";

export const practiceModes = {
  flashcard: "Flashcard Review",
  audio: "Audio Drill",
  reading: "Reading Drill",
  mini: "Checkpoint Retry",
} as const;
export type PracticeMode = keyof typeof practiceModes;

export function practiceActivities(data: Awaited<ReturnType<typeof learningDashboard>>) {
  return data.chapters.filter(({ program, chapter }) => ["full", "preview"].includes(chapter.access) && ["full", "preview"].includes(data.catalog.access.learning[program.code])).flatMap(({ program, chapter, progress }) =>
    (Object.keys(practiceModes) as PracticeMode[]).flatMap(kind => {
      if (kind !== "flashcard" && program.family !== "jlpt") return [];
      const activity = kind === "mini"
        ? progress.mini_eligible === true && progress.mini_unlocked && progress.mini_completed === true && chapter.mini_checkpoint?.exists === true && ["n5", "n4", "n3", "n2"].includes(program.code)
          ? { total: 1, completed: 1, complete: true } : undefined
        : progress.activities[kind];
      if (!activity || activity.total < 1) return [];
      const base = `/learn/${encodeURIComponent(programSlug(program.code))}/chapter-${chapter.chapter_number}`;
      const href = kind === "flashcard" ? `${base}/flashcards` : kind === "mini" ? `${base}/checkpoint` : `/practice?practice_level=${encodeURIComponent(programSlug(program.code))}&practice_chapter=chapter-${chapter.chapter_number}&practice_kind=${kind}`;
      return [{ id: `${program.id}/${chapter.id}/${kind}`, program, chapter, kind, activity, href }];
    }));
}
