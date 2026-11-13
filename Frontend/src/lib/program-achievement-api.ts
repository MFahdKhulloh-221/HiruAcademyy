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
export function studentAchievements(page: number, signal?: AbortSignal): Promise<AchievementPage<Achievement>> {
  return apiRequest(`${studentPath}?page=${positiveId(page)}`, { signal });
}
export async function studentAchievement(id: number, signal?: AbortSignal): Promise<Achievement> {
  return (await apiRequest<{ data: Achievement }>(`${studentPath}/${positiveId(id)}`, { signal })).data;
}
export function reconcileAchievement(programId: number): Promise<{ data: Achievement | null; reason: string }> {
  return apiRequest(`${studentPath}/programs/${positiveId(programId)}/reconcile`, { method: "POST" });
}
