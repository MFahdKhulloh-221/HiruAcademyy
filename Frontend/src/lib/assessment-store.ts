"use client";

import { apiRequest } from "@/lib/api";
import { useLearningRequest } from "@/components/learning-hooks";
import { loadAdminTryOuts } from "@/lib/admin-tryout-api";
import { assessmentSessionLabels, assessmentSessions } from "@/lib/assessment-attempt";
import type { Assessment } from "@/lib/admin-assessment-store";

export type PublishedAssessmentOption = { id: string; label: string };
export type PublishedAssessmentQuestion = { id: string; section: string; prompt: string; options: PublishedAssessmentOption[] };
export type PublishedAssessment = { id: string; type: "tryout"; title: string; level: string; sections: string[]; questions: PublishedAssessmentQuestion[] };
const empty: PublishedAssessment[] = [];
const load = async (signal: AbortSignal) => {
  const { data } = await apiRequest<{ data: { id: number; title: string }[] }>("/api/student/try-outs", { signal });
  return data.map(item => ({ id: String(item.id), type: "tryout" as const, title: item.title, level: "", sections: [...assessmentSessionLabels], questions: [] }));
};
export function readPublishedAssessments() { return empty; }
export function usePublishedAssessments() { return useLearningRequest(load, "published-assessments").data ?? empty; }
export async function loadCanonicalAssessments(signal?: AbortSignal): Promise<Assessment[]> {
  const items = await loadAdminTryOuts(signal);
  return items.map(item => ({ id: item.id, type: "tryout", title: item.title, description: "", level: item.context, status: item.status, updatedAt: "", sections: assessmentSessions.map((id, index) => ({ id, name: assessmentSessionLabels[index], maxScore: 45 })), questions: item.questions.map(question => ({ id: question.id, prompt: question.prompt, explanation: question.explanation, imageUrl: "", audioUrl: question.audioUrl ?? "", sectionId: assessmentSessions[assessmentSessionLabels.indexOf(question.section as typeof assessmentSessionLabels[number])], options: question.answers.map((text, index) => ({ id: ["A", "B", "C", "D"][index], text, isCorrect: index === question.correctAnswer })) })) }));
}
