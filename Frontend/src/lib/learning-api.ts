import { apiRequest } from "@/lib/api";

export type LearningProgram = { id: number; code: string; slug?: string; name: string; description?: string | null; family: string };
export type LearningAccess = { learning: Record<string, "full" | "preview" | "none">; replay_levels: string[]; source_grants: { plan_code: string; program_code: string; starts_at?: string; ends_at?: string }[] };
export type LearningResource = { id: number; title: string; description?: string | null; sort_order: number };
export type LearningModule = LearningResource & { module_type: "grammar" | "kanji" | "general"; file_url: string | null; file_url_resolved_url?: string | null };
export type CanonicalChapter = LearningResource & {
  chapter_number: number;
  access: string;
  video_lessons?: (LearningResource & { video_url: string | null; video_url_resolved_url?: string | null })[];
  modules?: LearningModule[];
  flashcards?: { id: number; japanese: string; reading: string; meaning: string; example: string | null; sort_order: number }[];
  mini_checkpoint?: { exists: boolean };
  mini_checkpoints?: { session: number; part: number; duration_minutes: number | null; passing_score?: number | null; question_count: number; configuration_valid: boolean }[];
};
export type ChapterProgress = { chapter_id: number; activities: Record<string, { total: number; completed: number; complete: boolean; completed_ids?: number[] }>; mini_eligible?: boolean; mini_completed?: boolean; mini_unlocked: boolean };
export type LibraryModule = {
  id: string;
  resource_id: number;
  category: string;
  type?: string;
  title: string;
  description: string;
  level: string;
  program: LearningProgram;
  chapter: { id: number; chapter_number: number; title: string };
  file_url?: string | null;
  file_url_resolved_url?: string | null;
  href: string;
  locked: boolean;
};

export type FlashcardDeck = {
  id: number;
  program_code: string;
  program_name: string;
  level: string;
  chapter_number: number;
  chapter_title: string;
  title: string;
  category: string;
  card_count: number;
  progress: number;
  glyph: string;
  description: string;
  action: "Mulai" | "Review";
  cta_label: string;
  locked: boolean;
  href: string;
};

export type FlashcardCatalogData = {
  metrics: {
    cards_studied: number;
    cards_available: number;
    decks_completed: number;
    streak_days: number;
  };
  decks: FlashcardDeck[];
};

export type OverallProgressData = {
  overall_percentage: number;
  streak_days: number;
  kanji_mastered: number;
  practice_completed: number;
  accuracy: number;
  active_program: { name: string; level: string; percentage: number };
  programs: { code: string; name: string; level: string; required: number; completed: number; percentage: number }[];
  chapters: { chapter_id: number; program_code: string; chapter_number: number; title: string; required: number; completed: number; percentage: number; is_complete: boolean }[];
};

export function programCode(slug: string) { return slug === "ssw-pengolahan-makanan" ? "ssw-food" : slug.toLowerCase(); }
export function programSlug(code: string) { return code === "ssw-food" ? "ssw-pengolahan-makanan" : code; }
export function chapterPath(programId: number, chapterId: number) {
  if (!Number.isSafeInteger(programId) || programId < 1 || !Number.isSafeInteger(chapterId) || chapterId < 1) throw new Error("Invalid learning resource ID");
  return `/api/student/programs/${programId}/chapters/${chapterId}`;
}
export function safeLearningUrl(value?: string | null) {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}
export function completionPercent(activities: ChapterProgress["activities"]) {
  const totals = Object.values(activities).reduce((sum, activity) => ({ total: sum.total + activity.total, completed: sum.completed + activity.completed }), { total: 0, completed: 0 });
  return totals.total > 0 ? Math.min(100, Math.max(0, Math.round(totals.completed / totals.total * 100))) : 0;
}
export function learningVideo(value?: string | null): { kind: "native" | "youtube"; url: string } | undefined {
  const safe = safeLearningUrl(value);
  if (!safe) return;
  const url = new URL(safe);
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
    id = url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})$/.exec(url.pathname)?.[1] ?? null;
  } else if (host === "youtu.be") id = url.pathname.slice(1);
  if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return { kind: "youtube", url: `https://www.youtube-nocookie.com/embed/${id}` };
  if (/\.(mp4|webm)$/i.test(url.pathname)) return { kind: "native", url: safe };
}
export function learningMembership(access: LearningAccess): "free" | "lms" | "sensei" {
  return access.source_grants.some(item => item.plan_code === "sensei") ? "sensei" : access.source_grants.some(item => item.plan_code === "lms") ? "lms" : "free";
}
export async function learningCatalog(signal?: AbortSignal) {
  const { data } = await apiRequest<{ data: Pick<LearningDashboardData, "programs" | "access"> }>("/api/student/dashboard", { signal });
  return { programs: data.programs, access: data.access };
}
export type LearningDashboardData = {
  programs: LearningProgram[];
  access: LearningAccess;
  chapters: { program_id: number; chapter: CanonicalChapter; progress?: ChapterProgress }[];
};
export async function learningDashboard(signal?: AbortSignal) {
  const { data } = await apiRequest<{ data: LearningDashboardData }>("/api/student/dashboard", { signal });
  const chapters = data.chapters.flatMap(({ program_id, chapter, progress }) => {
    if (["locked", "none"].includes(chapter.access)) return [];
    const program = data.programs.find(item => item.id === program_id);
    if (!program || !progress) throw new Error("Invalid dashboard chapter progress");
    return [{ program, chapter, progress }];
  });
  return { catalog: { programs: data.programs, access: data.access }, chapters };
}
export async function learningChapters(programId: number, signal?: AbortSignal) {
  return (await apiRequest<{ data: CanonicalChapter[] }>(`/api/student/programs/${programId}/chapters`, { signal })).data;
}
export async function learningChapter(programId: number, chapterId: number, signal?: AbortSignal) {
  return (await apiRequest<{ data: CanonicalChapter }>(chapterPath(programId, chapterId), { signal })).data;
}
export function learningProgress(programId: number, chapterId: number, signal?: AbortSignal) {
  return apiRequest<{ data: ChapterProgress }>(`${chapterPath(programId, chapterId)}/progress`, { signal }).then(response => response.data);
}
export function learningCompletion(programId: number, chapterId: number, type: "video" | "module" | "flashcard", resourceId?: number) {
  return apiRequest<{ data: ChapterProgress }>(`${chapterPath(programId, chapterId)}/completions`, { method: "POST", body: JSON.stringify({ type, ...(resourceId === undefined ? {} : { resource_id: resourceId }) }) }).then(response => response.data);
}
export async function learningLibrary(signal?: AbortSignal) {
  return (await apiRequest<{ data: LibraryModule[] }>("/api/student/library", { signal })).data;
}

export async function studentFlashcards(signal?: AbortSignal) {
  return (await apiRequest<{ data: FlashcardCatalogData }>("/api/student/flashcards", { signal })).data;
}

export type LeaderboardScope = "all" | "lms" | "sensei";
export type StudentLeaderboardEntry = {
  user_id: number; rank: number; name: string; avatar_url: string | null;
  category: "free" | "lms" | "sensei"; weekly_xp: number; streak_days: number; is_current_user: boolean;
};
export type StudentLeaderboardData = {
  scope: LeaderboardScope; week_start: string; week_end: string;
  entries: StudentLeaderboardEntry[]; self: StudentLeaderboardEntry | null;
};
export type StudentGamificationData = {
  streak_days: number; weekly_xp: number;
  challenge: {
    active_days: number; target_days: 5; total_days: 7; starts_on: string; ends_on: string;
    status: "active" | "achieved" | "expired"; badge: "Pemula Konsisten" | null;
  };
};
export async function studentLeaderboard(scope: LeaderboardScope, signal?: AbortSignal) {
  return (await apiRequest<{ data: StudentLeaderboardData }>(`/api/student/leaderboard?scope=${scope}`, { signal })).data;
}
export async function studentGamification(signal?: AbortSignal) {
  return (await apiRequest<{ data: StudentGamificationData }>("/api/student/gamification", { signal })).data;
}

export async function studentOverallProgress(signal?: AbortSignal) {
  return (await apiRequest<{ data: OverallProgressData }>("/api/student/progress", { signal })).data;
}
