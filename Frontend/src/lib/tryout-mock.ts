import type { AssessmentQuestion } from "@/lib/assessment-mock";

export const tryoutLevels = ["N5", "N4", "N3", "N2", "N1"] as const;
export const jlptTryoutSessions = ["Kosakata & Kanji", "Tata Bahasa", "Reading / Dokkai", "Audio / Choukai"] as const;
export type TryoutLevel = (typeof tryoutLevels)[number];
export type TryoutSession = (typeof jlptTryoutSessions)[number];
export const tryoutConfig = Object.fromEntries(tryoutLevels.map(level => [level, { sectionPassingScore: 19, totalPassingScore: null }])) as Record<TryoutLevel, { sectionPassingScore: number; totalPassingScore: null }>;
export const tryoutQuestions: Record<TryoutSession, AssessmentQuestion[]> = { "Kosakata & Kanji": [], "Tata Bahasa": [], "Reading / Dokkai": [], "Audio / Choukai": [] };
