import type { Membership } from "@/lib/dashboard-mock";

export const practiceLevels = ["Dasar Bahasa Jepang", "N5", "N4", "N3", "N2", "SSW Pengolahan Makanan"] as const;
export const practiceCategories = ["Kosakata", "Kanji", "Tata Bahasa", "Audio", "Reading"] as const;
export type PracticeLevel = (typeof practiceLevels)[number];
export type PracticeCategory = (typeof practiceCategories)[number];
export type PracticeQuestion = { id: string; prompt: string; options: { id: string; text: string }[] };
export type PracticeAnswerKey = Record<string, number>;
export type PracticeHistory = { id: string; level: PracticeLevel; category?: PracticeCategory; exercise: number; score: number; correct: number; total: number; at: string };
export type PracticeDraft = { key: string; answers: Record<string, number>; questionIndex: number };

const questions: PracticeQuestion[] = [];
const answerKey: PracticeAnswerKey = {};

export function getPracticeQuestions(): PracticeQuestion[] {
  return questions;
}

export function getPracticeAnswerKey(): PracticeAnswerKey {
  return answerKey;
}

export function levelHasCategories(level: PracticeLevel) {
  return level !== "Dasar Bahasa Jepang" && level !== "SSW Pengolahan Makanan";
}

export function canAccessPracticeLevel(membership: Membership, level: PracticeLevel) {
  if (membership === "free") return level === "Dasar Bahasa Jepang" || level === "N5";
  if (membership === "lms") return ["Dasar Bahasa Jepang", "N5", "N4"].includes(level);
  return ["N4", "N3"].includes(level);
}

export function defaultPracticeLevel(membership: Membership): PracticeLevel {
  return membership === "free" ? "N5" : "N4";
}

export function practiceKey(level: PracticeLevel, exercise: number, category?: PracticeCategory) {
  return `${level}|${category ?? ""}|${exercise}`;
}

export function historyKey(membership: Membership) {
  return `hiru:practice-history:${membership}`;
}

export function progressKey(membership: Membership) {
  return `hiru:practice-progress:${membership}`;
}
