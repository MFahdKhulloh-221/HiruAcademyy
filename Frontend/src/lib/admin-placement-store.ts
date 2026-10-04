"use client";

import { useLearningRequest } from "@/components/learning-hooks";
import { loadAdminPlacement, loadAdminPlacementLeads, saveAdminPlacement } from "@/lib/admin-placement-api";

export type PlacementOption = { id: string; text: string; isCorrect: boolean };
export type PlacementQuestion = { id: string; number: number; area: string; prompt: string; imageUrl?: string; audioUrl?: string; options: PlacementOption[]; explanation?: string };
export type RecommendationRule = { id: string; minScore: number; maxScore: number; recommendedProgramCode: string; resultTitle: string; resultDescription: string; ctaLabel?: string; ctaDestination?: string; order: number };
export type PlacementConfig = { id: string; title: string; introHeading: string; description: string; durationMinutes: number; status: "Draft" | "Published"; questions: PlacementQuestion[]; rules: RecommendationRule[]; updatedAt: string };
export type PlacementLead = { id: string; date: string; name: string; whatsapp: string; target: string; score: number; recommendedLevel: string; status: "Baru" | "Sudah Dihubungi" };
export type PlacementStoreData = { version: 1; config: PlacementConfig; publishedConfig?: PlacementConfig; leads: PlacementLead[] };
export const initialPlacementStore: PlacementStoreData = { version: 1, config: { id: "", title: "", introHeading: "", description: "", durationMinutes: 0, status: "Draft", questions: [], rules: [], updatedAt: "" }, leads: [] };
export function loadPlacementStore(storage?: Pick<Storage, "getItem" | "setItem"> | null): PlacementStoreData { void storage; return initialPlacementStore; }
export async function savePlacementStore(data: PlacementStoreData): Promise<PlacementStoreData> {
  const configId = data.config.id ? Number(data.config.id) : undefined;
  await saveAdminPlacement(
    { title: data.config.title, introHeading: data.config.introHeading, description: data.config.description, minutes: String(data.config.durationMinutes) },
    configId,
    data.config.status === "Published",
    data.config.rules
  );
  return data;
}
const load = async (signal: AbortSignal): Promise<PlacementStoreData> => {
  const [result, leadsData] = await Promise.all([loadAdminPlacement(signal), loadAdminPlacementLeads(signal).catch(() => [])]);
  if (!result.config) return initialPlacementStore;
  const config: PlacementConfig = {
    id: String(result.config.id),
    ...result.settings,
    durationMinutes: Number(result.settings.minutes),
    status: result.config.status === "published" ? "Published" : "Draft",
    updatedAt: "",
    rules: (result.rules ?? []).map((r, i) => ({ id: String(r.id ?? i + 1), minScore: r.minScore, maxScore: r.maxScore, recommendedProgramCode: r.recommendedProgramCode, resultTitle: r.resultTitle, resultDescription: r.resultDescription, order: i + 1 })),
    questions: result.questions.map(question => ({ id: String(question.id), number: question.sort_order, area: question.category, prompt: question.prompt, imageUrl: question.image_url ?? "", audioUrl: question.audio_url ?? "", explanation: question.explanation ?? "", options: Object.entries(question.options).map(([id, text]) => ({ id, text, isCorrect: id === question.correct_option })) }))
  };
  const leads: PlacementLead[] = leadsData.map(lead => ({
    id: String(lead.id),
    date: lead.date,
    name: lead.name,
    whatsapp: lead.whatsapp,
    target: lead.target,
    score: lead.score ?? 0,
    recommendedLevel: lead.recommended_level ?? "-",
    status: lead.status === "contacted" ? "Sudah Dihubungi" : "Baru"
  }));
  return { version: 1, config, publishedConfig: config.status === "Published" ? config : undefined, leads };
};
export function usePlacementAdminStore() { return useLearningRequest(load, "admin-placement-store").data ?? initialPlacementStore; }
