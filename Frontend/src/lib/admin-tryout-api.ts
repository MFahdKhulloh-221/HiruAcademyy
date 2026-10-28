import { apiRequest, ApiError } from "@/lib/api";
import { assessmentSessions } from "@/lib/assessment-attempt";
import { jlptTryoutSessions as assessmentSessionLabels } from "@/lib/tryout-mock";
import type { AdminAssessment, AdminAssessmentQuestion } from "@/components/admin-assessment-fixtures";

export type AdminTryOut = AdminAssessment & { sessionPassingScores?: Record<string, number> | null };
type Question = { instruction?: string | null; japanese?: AdminAssessmentQuestion["japanese"] | null; id: number; session: string; question: string; options: Record<string, string>; correct_option: string; explanation: string | null; reading_passage: string | null; audio_url: string | null; point_value: number; sort_order: number; status: string };
type Assessment = { access_type?: "free" | "membership"; max_score: number; sort_order: number; session_passing_scores: Record<string, number> | null; id: number; program_id: number; title: string; status: string; total_passing_score: number | null; duration_minutes?: number | null; questions?: Question[] };
export async function loadAdminTryOuts(signal?: AbortSignal): Promise<AdminTryOut[]> {
  const [catalog, programs] = await Promise.all([apiRequest<{ data: Assessment[] }>("/api/admin/try-outs", { signal }), apiRequest<{ data: { id: number; code: string }[] }>("/api/admin/programs", { signal })]);
  return Promise.all(catalog.data.map(async item => {
    const { data } = await apiRequest<{ data: Assessment }>(`/api/admin/try-outs/${item.id}`, { signal });
    return { accessType: data.access_type ?? "membership", id: String(data.id), kind: "tryout", title: data.title, context: programs.data.find(program => program.id === data.program_id)?.code.toUpperCase() ?? "", chapter: "", session: "", part: "", duration: data.duration_minutes == null ? "" : String(data.duration_minutes), sessionPassingScores: data.session_passing_scores, maxScore: String(data.max_score), passingScore: data.total_passing_score === null ? "" : String(data.total_passing_score), order: String(data.sort_order), status: data.status === "published" ? "Published" : "Draft", questions: (data.questions ?? []).map(question => ({ id: String(question.id), section: assessmentSessionLabels[assessmentSessions.indexOf(question.session as typeof assessmentSessions[number])] ?? "", type: question.session === "audio" ? "Audio" : question.session === "reading" ? "Reading" : "Multiple choice", prompt: question.question, instruction: question.instruction ?? "", japanese: question.japanese ?? undefined, answers: ["A", "B", "C", "D"].map(option => question.options[option]), correctAnswer: ["A", "B", "C", "D"].indexOf(question.correct_option), explanation: question.explanation ?? "", passage: question.reading_passage ?? "", file: null, order: String(question.sort_order), status: question.status === "published" ? "Published" : "Draft", audioUrl: question.audio_url ?? "", pointValue: question.point_value })) };
  }));
}
function questionPayload(question: AdminAssessmentQuestion) {
  return { session: assessmentSessions[assessmentSessionLabels.indexOf(question.section as typeof assessmentSessionLabels[number])], question: question.prompt, instruction: question.instruction || null, japanese: question.japanese?.text ? question.japanese : null, options: Object.fromEntries(question.answers.map((answer, index) => [["A", "B", "C", "D"][index], answer])), correct_option: ["A", "B", "C", "D"][question.correctAnswer], explanation: question.explanation || null, reading_passage: question.passage || null, audio_url: question.audioUrl || null, point_value: question.pointValue ?? 1, sort_order: Number(question.order), status: question.status.toLowerCase() };
}
export async function setAdminTryOutStatus(id: string, status: AdminAssessment["status"]) {
  await apiRequest(`/api/admin/try-outs/${id}`, { method: "PATCH", body: JSON.stringify({ status: status.toLowerCase() }) });
}
export async function publishAdminTryOutQuestions(id: string) {
  return (await apiRequest<{ data: { try_out_id: number; published_count: number } }>(`/api/admin/try-outs/${id}/questions/publish`, { method: "POST" })).data;
}
export function adminTryOutError(cause: unknown) {
  if (!(cause instanceof ApiError)) return cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi.";
  if (cause.status === 401 || cause.status === 419) return "Sesi berakhir. Silakan masuk kembali.";
  if (cause.status === 403) return "Akses admin diperlukan. Anda tidak diizinkan melakukan tindakan ini.";
  if (cause.status === 422) return [cause.message, ...Object.entries(cause.errors).flatMap(([field, messages]) => messages.map(message => `${field}: ${message}`))].join(" ");
  if (cause.status === 429) return "Terlalu banyak percobaan. Silakan coba lagi nanti.";
  if (cause.status >= 500) return "Server mengalami gangguan. Silakan coba lagi nanti.";
  return cause.message;
}
export async function saveAdminTryOut(item: AdminTryOut, baseline?: AdminTryOut) {
  const { data: programs } = await apiRequest<{ data: { id: number; code: string }[] }>("/api/admin/programs");
  const program = programs.find(program => program.code.toUpperCase() === item.context);
  if (!program) throw new ApiError(422);
  if (item.questions.some(question => question.file)) throw new Error("OPEN: upload audio backend belum tersedia.");
  if (item.questions.some(question => !question.pointValue || !Number.isSafeInteger(question.pointValue))) throw new Error("Point value wajib diisi.");
  if (item.duration !== "" && (!Number.isSafeInteger(Number(item.duration)) || Number(item.duration) < 1 || Number(item.duration) > 2147483647)) throw new ApiError(422, { duration_minutes: ["Durasi harus berupa bilangan bulat positif."] });
  const existing = /^\d+$/.test(item.id);
  const path = `/api/admin/try-outs${existing ? `/${item.id}` : ""}`;
  const { data } = await apiRequest<{ data: Assessment }>(path, { method: existing ? "PATCH" : "POST", body: JSON.stringify({ access_type: item.accessType ?? "membership", program_id: program.id, title: item.title, max_score: Number(item.maxScore), sort_order: Number(item.order), ...(item.sessionPassingScores !== undefined ? { session_passing_scores: item.sessionPassingScores } : {}), status: "draft", duration_minutes: item.duration === "" ? null : Number(item.duration), total_passing_score: item.passingScore === "" ? null : Number(item.passingScore) }) });
  for (const question of item.questions) {
    const saved = /^\d+$/.test(question.id);
    const previous = baseline?.questions.find(item => item.id === question.id);
    const body = JSON.stringify(questionPayload(question));
    if (saved && previous && body === JSON.stringify(questionPayload(previous))) continue;
    await apiRequest(`/api/admin/try-outs/${data.id}/questions${saved ? `/${question.id}` : ""}`, { method: saved ? "PATCH" : "POST", body });
  }
  await apiRequest(`/api/admin/try-outs/${data.id}`, { method: "PATCH", body: JSON.stringify({ status: item.status.toLowerCase() }) });
  return loadAdminTryOuts();
}
export async function deleteAdminTryOut(id: string, question?: AdminAssessmentQuestion) {
  await apiRequest(`/api/admin/try-outs/${id}${question ? `/questions/${question.id}` : ""}`, { method: "DELETE" });
  return loadAdminTryOuts();
}
