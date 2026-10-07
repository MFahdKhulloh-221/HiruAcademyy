import { apiRequest } from "@/lib/api";
import { uploadAdminMedia } from "@/lib/admin-media";
import type { PlacementSettings, PlacementQuestion } from "@/components/admin-placement-preview";

export type RecommendationRule = {
  id?: string;
  minScore: number;
  maxScore: number;
  recommendedProgramCode: string;
  resultTitle: string;
  resultDescription: string;
};

export type PlacementLead = {
  id: number;
  date: string;
  name: string;
  whatsapp: string;
  target: string;
  score: number | null;
  recommended_level: string | null;
  status: "new" | "contacted";
};

type Config = { id: number; title: string; intro_heading: string; duration_minutes: number; description: string; status: string; recommendation_rules?: RecommendationRule[] };
type Question = { id: number; placement_config_id: number; prompt: string; options: Record<string, string>; correct_option: string; category: string; explanation: string | null; status: string; sort_order: number; image_url: string | null; audio_url: string | null };
export async function loadAdminPlacement(signal?: AbortSignal) {
  const [configs, questions] = await Promise.all([apiRequest<{ data: Config[] }>("/api/admin/placement-configs", { signal }), apiRequest<{ data: Question[] }>("/api/admin/placement-questions", { signal })]);
  const config = configs.data.at(-1);
  return { config, questions: questions.data.filter(question => question.placement_config_id === config?.id), settings: config ? { title: config.title, introHeading: config.intro_heading, minutes: String(config.duration_minutes), description: config.description } : { title: "", introHeading: "", minutes: "", description: "" }, rules: config?.recommendation_rules ?? [] };
}
export async function saveAdminPlacement(settings: PlacementSettings, id: number | undefined, published: boolean, rules?: RecommendationRule[]) {
  return (await apiRequest<{ data: Config }>(`/api/admin/placement-configs${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", body: JSON.stringify({ title: settings.title, intro_heading: settings.introHeading, duration_minutes: Number(settings.minutes), description: settings.description, status: published ? "published" : "draft", ...(rules !== undefined ? { recommendation_rules: rules } : {}) }) })).data;
}
export async function loadAdminPlacementLeads(signal?: AbortSignal) {
  return (await apiRequest<{ data: PlacementLead[] }>("/api/admin/placement-leads", { signal })).data;
}
export async function updateAdminPlacementLead(id: number, status: "new" | "contacted") {
  return (await apiRequest<{ data: { id: number; status: string } }>(`/api/admin/placement-leads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })).data;
}
export async function saveAdminPlacementQuestion(question: PlacementQuestion, config: number, order: number) {
  const imageUrl = question.image ? (await uploadAdminMedia(question.image, "image")).path : question.imageUrl;
  const audioUrl = question.audio ? (await uploadAdminMedia(question.audio, "audio")).path : question.audioUrl;
  const saved = /^\d+$/.test(question.id);
  return (await apiRequest<{ data: Question }>(`/api/admin/placement-questions${saved ? `/${question.id}` : ""}`, { method: saved ? "PATCH" : "POST", body: JSON.stringify({ placement_config_id: config, prompt: question.prompt, options: Object.fromEntries(question.answers.map((answer, index) => [["A", "B", "C", "D"][index], answer])), correct_option: question.correct, category: question.category, explanation: question.explanation || null, sort_order: order, status: question.published ? "published" : "draft", image_url: imageUrl || null, audio_url: audioUrl || null }) })).data;
}
export function placementQuestionView(question: Question): PlacementQuestion {
  return { id: String(question.id), prompt: question.prompt, answers: ["A", "B", "C", "D"].map(option => question.options[option]), correct: question.correct_option, category: question.category, published: question.status === "published", explanation: question.explanation ?? "", imageUrl: question.image_url ?? "", audioUrl: question.audio_url ?? "" };
}
export function deleteAdminPlacementQuestion(id: string) { return apiRequest(`/api/admin/placement-questions/${id}`, { method: "DELETE" }); }
