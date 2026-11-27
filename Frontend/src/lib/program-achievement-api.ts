import { apiRequest, ApiError } from "@/lib/api";

export type AchievementPresentation = {
  title: string | null;
  description: string | null;
  background_image: null;
  presentation_version: number;
  issuer: string | null;
  signature_data_url?: string | null;
  signature_position?: "bottom-left" | "bottom-right";
};
export type Achievement = {
  id: number;
  program_id: number;
  student_name_snapshot: string | null;
  program_name_snapshot: string | null;
  program_code_snapshot: string | null;
  learning_type_snapshot: "free" | "lms" | "sensei";
  presentation_snapshot: AchievementPresentation;
  issued_at: string | null;
  completion_summary: { completed_chapters: number; total_chapters: number; required_activities_complete: boolean };
};
export type AchievementConfiguration = {
  program: { id: number; code: string; name: string };
  settings: {
    automatic_enabled: boolean;
    title: string;
    description: string | null;
    background_image: null;
    presentation_version: number;
  };
  is_default: boolean;
};
export type AchievementSettingsPatch = Partial<Pick<AchievementConfiguration["settings"], "automatic_enabled" | "title" | "description">>;
export type AchievementPage<T> = {
  data: T[];
  meta: { current_page: number; last_page: number; total: number; per_page: number };
};

function positiveId(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) throw new ApiError(404);
  return value;
}
const adminPath = "/api/admin/program-achievements";
const studentPath = "/api/student/program-achievements";
export function adminAchievements(page: number, signal?: AbortSignal): Promise<AchievementPage<AchievementConfiguration>> {
  return apiRequest(`${adminPath}?page=${positiveId(page)}`, { signal });
}
export async function updateAchievement(programId: number, patch: AchievementSettingsPatch): Promise<AchievementConfiguration> {
  return (await apiRequest<{ data: AchievementConfiguration }>(`${adminPath}/${positiveId(programId)}`, { method: "PATCH", body: JSON.stringify(patch) })).data;
}
export async function previewAchievement(programId: number, signal?: AbortSignal): Promise<AchievementConfiguration> {
  return (await apiRequest<{ data: AchievementConfiguration }>(`${adminPath}/${positiveId(programId)}/preview`, { signal })).data;
}
// Issued snapshots stay intact; current backend eligibility controls student display.
async function visibleAchievements(rows: Achievement[], signal?: AbortSignal): Promise<Achievement[]> {
  const visible = await Promise.all(rows.map(async row => (await achievementStatus(row.program_id, signal)).eligible));
  return rows.filter((_, index) => visible[index]);
}
export async function studentAchievements(page: number, signal?: AbortSignal): Promise<AchievementPage<Achievement>> {
  const result = await apiRequest<AchievementPage<Achievement>>(`${studentPath}?page=${positiveId(page)}`, { signal });
  return { ...result, data: await visibleAchievements(result.data, signal) };
}
export async function studentAchievement(id: number, signal?: AbortSignal): Promise<Achievement> {
  const row = (await apiRequest<{ data: Achievement }>(`${studentPath}/${positiveId(id)}`, { signal })).data;
  if (!(await achievementStatus(row.program_id, signal)).eligible) throw new ApiError(404);
  return row;
}
export async function reconcileAchievement(programId: number): Promise<{ data: Achievement | null; reason: string }> {
  const result = await apiRequest<{ data: Achievement | null; reason: string }>(`${studentPath}/programs/${positiveId(programId)}/reconcile`, { method: "POST" });
  if (result.data) {
    const status = await achievementStatus(programId);
    if (!status.eligible) return { data: null, reason: status.reason };
  }
  return result;
}
export type AchievementStatus = {
  achievement: Achievement | null;
  total_chapters: number;
  completed_chapters: number;
  eligible: boolean;
  reason: string;
  has_new_material: boolean;
  certificate_title: string;
};
export async function achievementStatus(programId: number, signal?: AbortSignal): Promise<AchievementStatus> {
  return (await apiRequest<{ data: AchievementStatus }>(`${studentPath}/programs/${positiveId(programId)}/status`, { signal })).data;
}
export async function achievementNotices(signal?: AbortSignal): Promise<Achievement[]> {
  return visibleAchievements((await apiRequest<{ data: Achievement[] }>(`${studentPath}/notices`, { signal })).data, signal);
}
export function dismissAchievementNotice(id: number) {
  return apiRequest(`${studentPath}/${positiveId(id)}/dismiss-notice`, { method: "POST" });
}
export function requestAchievementNotice(programId?: number) {
  window.dispatchEvent(new CustomEvent("hiru:achievement-ready", { detail: { programId } }));
  window.dispatchEvent(new Event("hiru:notifications-changed"));
}
