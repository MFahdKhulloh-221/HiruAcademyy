import { apiRequest } from "@/lib/api";

export type LearningProgram = { id: number; code: string; name: string; family: string };
export type LearningAccess = { learning: Record<string, "full" | "preview" | "none">; replay_levels: string[]; source_grants: { plan_code: string; program_code: string }[] };
export type LearningResource = { id: number; title: string; description?: string | null; sort_order: number };
export type LearningModule = LearningResource & { module_type: "grammar" | "kanji" | "general"; file_url: string };
export type CanonicalChapter = LearningResource & {
  chapter_number: number;
  access: string;
  video_lessons?: (LearningResource & { video_url: string })[];
  modules?: LearningModule[];
  flashcards?: { id: number; japanese: string; reading: string; meaning: string; example: string | null; sort_order: number }[];
  mini_checkpoint?: { exists: boolean };
};
export type ChapterProgress = { chapter_id: number; activities: Record<string, { total: number; completed: number; complete: boolean }>; mini_unlocked: boolean };
export type LibraryModule = LearningModule & { program: LearningProgram; chapter: { id: number; chapter_number: number; title: string } };

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
export function learningMembership(access: LearningAccess): "free" | "lms" | "sensei" {
  return access.source_grants.some(item => item.plan_code === "sensei") ? "sensei" : access.source_grants.some(item => item.plan_code === "lms") ? "lms" : "free";
}
export async function learningCatalog(signal?: AbortSignal) {
  const [programs, access] = await Promise.all([
    apiRequest<{ data: LearningProgram[] }>("/api/public/programs", { signal }),
    apiRequest<{ data: LearningAccess }>("/api/student/access", { signal }),
  ]);
  return { programs: programs.data, access: access.data };
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
