import { apiRequest, ApiError } from "@/lib/api";
import { assessmentSessionLabels, assessmentSessions } from "@/lib/assessment-attempt";
import type { AdminAssessment, AdminAssessmentQuestion } from "@/components/admin-assessment-fixtures";

type Question = { id: number; session: string; question: string; options: Record<string, string>; correct_option: string; explanation: string | null; reading_passage: string | null; audio_url: string | null; point_value: number; sort_order: number; status: string };
type Assessment = { id: number; program_id: number; title: string; status: string; total_passing_score: number | null; questions?: Question[] };
export async function loadAdminTryOuts(signal?: AbortSignal): Promise<AdminAssessment[]> {
  const [catalog, programs] = await Promise.all([apiRequest<{ data: Assessment[] }>("/api/admin/try-outs", { signal }), apiRequest<{ data: { id: number; code: string }[] }>("/api/admin/programs", { signal })]);
  return Promise.all(catalog.data.map(async item => {
    const { data } = await apiRequest<{ data: Assessment }>(`/api/admin/try-outs/${item.id}`, { signal });
    return { id: String(data.id), kind: "tryout", title: data.title, context: programs.data.find(program => program.id === data.program_id)?.code.toUpperCase() ?? "", chapter: "", session: "", part: "", duration: "", maxScore: "180", passingScore: data.total_passing_score === null ? "" : String(data.total_passing_score), order: String(data.id), status: data.status === "published" ? "Published" : "Draft", questions: (data.questions ?? []).map(question => ({ id: String(question.id), section: assessmentSessionLabels[assessmentSessions.indexOf(question.session as typeof assessmentSessions[number])] ?? "", type: question.audio_url ? "Audio" : question.reading_passage ? "Reading" : "Multiple choice", prompt: question.question, instruction: "", answers: ["A", "B", "C", "D"].map(option => question.options[option]), correctAnswer: ["A", "B", "C", "D"].indexOf(question.correct_option), explanation: question.explanation ?? "", passage: question.reading_passage ?? "", file: null, order: String(question.sort_order), status: question.status === "published" ? "Published" : "Draft", audioUrl: question.audio_url ?? "", pointValue: question.point_value })) };
  }));
}
export async function saveAdminTryOut(item: AdminAssessment) {
  const { data: programs } = await apiRequest<{ data: { id: number; code: string }[] }>("/api/admin/programs");
  const program = programs.find(program => program.code.toUpperCase() === item.context);
  if (!program) throw new ApiError(422);
  if (item.questions.some(question => question.file)) throw new Error("OPEN: upload audio backend belum tersedia.");
  if (item.questions.some(question => !question.pointValue || !Number.isSafeInteger(question.pointValue))) throw new Error("Point value wajib diisi.");
  if (item.questions.some(question => question.japanese?.text || question.instruction)) throw new Error("OPEN: field teks Jepang dan instruksi belum tersedia di backend.");
  const existing = /^\d+$/.test(item.id);
  const path = `/api/admin/try-outs${existing ? `/${item.id}` : ""}`;
  const { data } = await apiRequest<{ data: Assessment }>(path, { method: existing ? "PATCH" : "POST", body: JSON.stringify({ program_id: program.id, title: item.title, status: "draft", total_passing_score: item.passingScore === "" ? null : Number(item.passingScore) }) });
  for (const question of item.questions) {
    const saved = /^\d+$/.test(question.id);
    await apiRequest(`/api/admin/try-outs/${data.id}/questions${saved ? `/${question.id}` : ""}`, { method: saved ? "PATCH" : "POST", body: JSON.stringify({ session: assessmentSessions[assessmentSessionLabels.indexOf(question.section as typeof assessmentSessionLabels[number])], question: question.prompt, options: Object.fromEntries(question.answers.map((answer, index) => [["A", "B", "C", "D"][index], answer])), correct_option: ["A", "B", "C", "D"][question.correctAnswer], explanation: question.explanation || null, reading_passage: question.passage || null, audio_url: question.audioUrl || null, point_value: question.pointValue ?? 1, sort_order: Number(question.order), status: question.status.toLowerCase() }) });
  }
  await apiRequest(`/api/admin/try-outs/${data.id}`, { method: "PATCH", body: JSON.stringify({ status: item.status.toLowerCase() }) });
  return loadAdminTryOuts();
}
export async function deleteAdminTryOut(id: string, question?: AdminAssessmentQuestion) {
  await apiRequest(`/api/admin/try-outs/${id}${question ? `/questions/${question.id}` : ""}`, { method: "DELETE" });
  return loadAdminTryOuts();
}
