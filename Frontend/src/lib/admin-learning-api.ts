import { apiRequest } from "@/lib/api";
import type { CanonicalChapter, LearningModule, LearningProgram, LearningResource } from "@/lib/learning-api";

export type AdminChapter = CanonicalChapter & { program_id: number; status: "draft" | "published" };
export type AdminMedia = LearningResource & { chapter_id: number; status: "draft" | "published"; video_url?: string; file_url?: string; module_type?: LearningModule["module_type"] };
export type AdminFlashcard = { id: number; chapter_id: number; japanese: string; reading: string; meaning: string; example: string | null; sort_order: number; status: "draft" | "published" };
export type LearningAdminResource = "chapters" | "video-lessons" | "modules" | "flashcards";
export async function adminLearningList<T>(resource: LearningAdminResource, signal?: AbortSignal) {
  return (await apiRequest<{ data: T[] }>(`/api/admin/${resource}`, { signal })).data;
}
export async function adminLearningSave<T>(resource: LearningAdminResource, payload: Record<string, unknown>, id?: number) {
  return (await apiRequest<{ data: T }>(`/api/admin/${resource}${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) })).data;
}
export function adminLearningDelete(resource: LearningAdminResource, id: number) {
  return apiRequest<void>(`/api/admin/${resource}/${id}`, { method: "DELETE" });
}
export async function adminLearningContext(signal?: AbortSignal) {
  const [programs, chapters] = await Promise.all([apiRequest<{ data: LearningProgram[] }>("/api/admin/programs", { signal }), adminLearningList<AdminChapter>("chapters", signal)]);
  return { programs: programs.data, chapters };
}
