import { learningDashboard, programSlug } from "@/lib/learning-api";

export function practiceActivities(data: Awaited<ReturnType<typeof learningDashboard>>) {
  return data.chapters.filter(({ program, chapter }) => program.family === "jlpt" && ["full", "preview"].includes(chapter.access) && ["full", "preview"].includes(data.catalog.access.learning[program.code])).flatMap(({ program, chapter, progress }) =>
    (["audio", "reading"] as const).flatMap(kind => {
      const activity = progress.activities[kind];
      if (!activity || activity.total < 1) return [];
      return [{ id: `${program.id}/${chapter.id}/${kind}`, program, chapter, kind, activity, href: `/practice?practice_level=${encodeURIComponent(programSlug(program.code))}&practice_chapter=chapter-${chapter.chapter_number}&practice_kind=${kind}` }];
    }));
}
