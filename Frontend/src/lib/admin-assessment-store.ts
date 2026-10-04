"use client";

import { useCallback, useEffect, useState } from "react";

export const ASSESSMENT_STORAGE_KEY = "hiru-admin-assessments:v1";
export const ASSESSMENT_CHANGE_EVENT = "hiru:assessments-change";
export const assessmentLevels = ["DASAR", "N5", "N4", "N3", "N2", "SSW"] as const;
export const practiceCategories = ["Kosakata", "Kanji", "Tata Bahasa", "Audio", "Reading"] as const;
export type AssessmentType = "practice" | "checkpoint" | "tryout" | "mini";
export type AssessmentStatus = "Draft" | "Published";
export type AssessmentOption = { id: string; text: string; isCorrect: boolean };
export type AssessmentQuestion = { id: string; prompt: string; explanation: string; imageUrl: string; audioUrl: string; sectionId?: string; options: AssessmentOption[] };
export type AssessmentSection = { id: string; name: string; maxScore?: number };
export type Assessment = { id: string; type: AssessmentType; status: AssessmentStatus; title: string; description: string; level: string; chapter?: number; category?: string; order?: number; durationMinutes?: number; maxAttempts?: number; session?: number; part?: 1 | 2; questions: AssessmentQuestion[]; sections: AssessmentSection[]; updatedAt: string };
export type LearnerOption = Omit<AssessmentOption, "isCorrect">;
export type LearnerQuestion = Omit<AssessmentQuestion, "options"> & { options: LearnerOption[] };
export type LearnerAssessment = Omit<Assessment, "questions"> & { questions: LearnerQuestion[] };
type Store = { version: 1; assessments: Assessment[] };

const types: AssessmentType[] = ["practice", "checkpoint", "tryout", "mini"];
const text = (value: unknown) => typeof value === "string" ? value : "";
const finiteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export const createOptions = (): AssessmentOption[] => ["A", "B", "C", "D"].map(() => ({ id: id(), text: "", isCorrect: false }));
export function createAssessment(type: AssessmentType): Assessment { return { id: id(), type, status: "Draft", title: "", description: "", level: type === "mini" ? "N5" : "", questions: [], sections: [], updatedAt: new Date().toISOString() }; }
function normalizeOption(value: unknown): AssessmentOption | null { if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>; return { id: text(item.id) || id(), text: text(item.text), isCorrect: item.isCorrect === true }; }
function normalizeQuestion(value: unknown): AssessmentQuestion | null { if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>; const options = Array.isArray(item.options) ? item.options.map(normalizeOption).filter((option): option is AssessmentOption => !!option) : []; return { id: text(item.id) || id(), prompt: text(item.prompt), explanation: text(item.explanation), imageUrl: text(item.imageUrl), audioUrl: text(item.audioUrl), sectionId: text(item.sectionId) || undefined, options: options.length ? options : createOptions() }; }
function normalizeAssessment(value: unknown): Assessment | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const type = types.includes(item.type as AssessmentType) ? item.type as AssessmentType : null;
  if (!type) return null;
  const level = text(item.level);
  const questionIds = new Set<string>();
  const sectionIds = new Set<string>();
  const questions = Array.isArray(item.questions) ? item.questions.map(normalizeQuestion).filter((question): question is AssessmentQuestion => !!question).map((question) => { const questionId = question.id && !questionIds.has(question.id) ? question.id : id(); questionIds.add(questionId); const optionIds = new Set<string>(); return { ...question, id: questionId, options: question.options.map((option) => { const optionId = option.id && !optionIds.has(option.id) ? option.id : id(); optionIds.add(optionId); return { ...option, id: optionId }; }) }; }) : [];
  const sections = Array.isArray(item.sections) ? item.sections.flatMap((section) => { if (!section || typeof section !== "object") return []; const row = section as Record<string, unknown>; const storedId = text(row.id); const sectionId = storedId && !sectionIds.has(storedId) ? storedId : id(); sectionIds.add(sectionId); return [{ id: sectionId, name: text(row.name), maxScore: finiteNumber(row.maxScore) }]; }) : [];
  return { id: text(item.id) || id(), type, status: item.status === "Published" ? "Published" : "Draft", title: text(item.title), description: text(item.description), level: assessmentLevels.includes(level as typeof assessmentLevels[number]) ? level : "", chapter: finiteNumber(item.chapter), category: text(item.category) || undefined, order: finiteNumber(item.order), durationMinutes: finiteNumber(item.durationMinutes), maxAttempts: finiteNumber(item.maxAttempts), session: finiteNumber(item.session), part: item.part === 1 || item.part === 2 ? item.part : undefined, questions, sections, updatedAt: text(item.updatedAt) || new Date().toISOString() };
}
export function normalizeAssessmentStore(value: unknown): Store { const raw = value && typeof value === "object" ? value as Record<string, unknown> : {}; return { version: 1, assessments: Array.isArray(raw.assessments) ? raw.assessments.map(normalizeAssessment).filter((item): item is Assessment => !!item) : [] }; }
export function readAssessments(storage?: Pick<Storage, "getItem"> | null): Assessment[] { void storage; return canonicalAssessments; }
let canonicalAssessments: Assessment[] = [];
export function readAssessment(idValue: string, storage?: Pick<Storage, "getItem"> | null) { return readAssessments(storage === undefined ? undefined : storage).find((item) => item.id === idValue); }
export function toLearnerAssessment(item: Assessment): LearnerAssessment { return { ...item, questions: item.questions.map((question) => ({ ...question, options: question.options.map(({ id: optionId, text: optionText }) => ({ id: optionId, text: optionText })) })) }; }
export function getScoringKey(item: Assessment): Record<string, string> { return Object.fromEntries(item.questions.map((question) => [question.id, question.options.find((option) => option.isCorrect)?.id ?? ""])); }
function announceChange() { if (typeof window !== "undefined") window.dispatchEvent(new Event(ASSESSMENT_CHANGE_EVENT)); }
export function saveAssessment(item: Assessment) { void item; throw new Error("OPEN: gunakan builder Try Out backend; kontrak assessment lain belum tersedia."); }
export async function deleteAssessment(idValue: string) { const { deleteAdminTryOut } = await import("@/lib/admin-tryout-api"); await deleteAdminTryOut(idValue); announceChange(); }
export function useAssessments() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [error, setError] = useState<string>();
  const refresh = useCallback(() => { import("@/lib/assessment-store").then(module => module.loadCanonicalAssessments()).then(items => { canonicalAssessments = items; setAssessments(items); setError(undefined); }).catch(cause => setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi.")); }, []);
  useEffect(() => { refresh(); window.addEventListener(ASSESSMENT_CHANGE_EVENT, refresh); return () => window.removeEventListener(ASSESSMENT_CHANGE_EVENT, refresh); }, [refresh]);
  return { assessments, refresh, error };
}
