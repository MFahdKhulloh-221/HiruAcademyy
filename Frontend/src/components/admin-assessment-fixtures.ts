import type { AssessmentQuestion } from "@/lib/assessment-mock";
import { miniCheckpointConfig } from "@/lib/sensei-mock";
import { jlptTryoutSessions, tryoutQuestions } from "@/lib/tryout-mock";

export const assessmentLetters = ["A", "B", "C", "D"] as const;
export const miniAssessmentContexts = ["DASAR", "N5", "N4", "N3", "N2", "SSW"] as const;
export const tryoutAssessmentContexts = ["N5", "N4", "N3", "N2", "N1"] as const;
export type AdminAssessmentKind = "mini" | "tryout";
export type AdminAssessmentQuestion = {
  id: string;
  section: string;
  type: "Multiple choice" | "Audio" | "Reading";
  prompt: string;
  japanese?: AssessmentQuestion["japanese"];
  instruction: string;
  answers: string[];
  correctAnswer: number;
  explanation: string;
  passage: string;
  file: File | null;
  order: string;
  status: "Draft" | "Published";
};
export type AdminAssessment = {
  id: string;
  kind: AdminAssessmentKind;
  title: string;
  context: string;
  chapter: string;
  session: string;
  part: string;
  duration: string;
  maxScore: string;
  passingScore: string;
  order: string;
  status: "Draft" | "Published";
  questions: AdminAssessmentQuestion[];
};

export function assessmentSections(item: Pick<AdminAssessment, "kind" | "context">): readonly string[] {
  return item.kind === "tryout" || !["DASAR", "SSW"].includes(item.context) ? jlptTryoutSessions : ["Chapter"];
}
export function orderedAssessmentQuestions(item: AdminAssessment) {
  const sections = assessmentSections(item);
  const sorted = [...item.questions].sort((a, b) => Number(a.order) - Number(b.order) || a.id.localeCompare(b.id));
  return sections.flatMap((section) => sorted.filter((question) => question.section === section)).concat(sorted.filter((question) => !sections.includes(question.section)));
}
export function copyAssessment(item: AdminAssessment): AdminAssessment {
  return { ...item, questions: item.questions.map((question) => ({ ...question, answers: [...question.answers], japanese: question.japanese ? { ...question.japanese } : undefined })) };
}
function adaptQuestion(question: AssessmentQuestion, section: string, index: number): AdminAssessmentQuestion {
  return { id: question.id, section, type: section === jlptTryoutSessions[2] ? "Reading" : section === jlptTryoutSessions[3] ? "Audio" : "Multiple choice", prompt: question.prompt, japanese: question.japanese ? { ...question.japanese } : undefined, instruction: "", answers: question.options.map((option) => option.label), correctAnswer: question.options.findIndex((option) => option.id === question.correctOptionId), explanation: question.explanation, passage: "", file: null, order: String(index + 1), status: "Published" };
}
export function createAssessmentFixtures(kind: AdminAssessmentKind): AdminAssessment[] {
  if (kind === "mini") return [{ id: "mini-n4-s2-p1", kind, title: miniCheckpointConfig.title, context: "N4", chapter: "", session: "2", part: "1", duration: "", maxScore: "100", passingScore: String(miniCheckpointConfig.passingScore ?? ""), order: "1", status: "Draft", questions: miniCheckpointConfig.questions.map((question, index) => adaptQuestion(question, jlptTryoutSessions[index === 0 ? 0 : 1], 0)) }];
  return tryoutAssessmentContexts.map((context, index) => ({ id: `tryout-${context.toLowerCase()}`, kind, title: `Try Out ${context} — Simulasi`, context, chapter: "", session: "", part: "", duration: "125", maxScore: "180", passingScore: "", order: String(index + 1), status: "Draft", questions: jlptTryoutSessions.flatMap((section) => tryoutQuestions[section].map((question, questionIndex) => adaptQuestion(question, section, questionIndex))) }));
}
export function validAssessmentAudio(file: File | null) {
  return !file || Boolean(file.name.trim() && file.size > 0 && file.type.startsWith("audio/"));
}
function positiveInteger(value: string) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
export function assessmentQuestionError(question: AdminAssessmentQuestion, item: AdminAssessment) {
  if (!assessmentSections(item).includes(question.section)) return "Pilih sesi yang valid.";
  if (!["Multiple choice", "Audio", "Reading"].includes(question.type) || (["DASAR", "SSW"].includes(item.context) && question.type !== "Multiple choice")) return "DASAR dan SSW hanya memakai Multiple choice.";
  if (!question.prompt.trim() || question.answers.length !== 4 || question.answers.some((answer) => !answer.trim())) return "Isi pertanyaan dan pilihan A–D.";
  if (!Number.isInteger(question.correctAnswer) || question.correctAnswer < 0 || question.correctAnswer > 3) return "Pilih jawaban benar A–D.";
  if (!positiveInteger(question.order)) return "Urutan harus berupa bilangan bulat positif.";
  if (!["Draft", "Published"].includes(question.status)) return "Pilih status yang valid.";
  if (!validAssessmentAudio(question.file)) return "Pilih file audio yang valid dan tidak kosong.";
  if (question.type !== "Audio" && question.file) return "File audio hanya untuk soal Audio.";
  if (question.type !== "Reading" && question.passage.trim()) return "Teks bacaan hanya untuk soal Reading.";
  return "";
}
export function assessmentError(item: AdminAssessment) {
  const contexts: readonly string[] = item.kind === "mini" ? miniAssessmentContexts : tryoutAssessmentContexts;
  if (!contexts.includes(item.context) || !item.title.trim()) return "Isi judul dan pilih konteks yang valid.";
  if (item.kind === "mini" && (!item.chapter.trim() || !positiveInteger(item.session) || !["1", "2"].includes(item.part))) return "Isi chapter, sesi, dan part yang valid.";
  if ((item.duration && !positiveInteger(item.duration)) || (item.kind === "tryout" && !item.duration)) return "Durasi harus berupa bilangan bulat positif.";
  if (!positiveInteger(item.maxScore) || !positiveInteger(item.order)) return "Skor maksimal dan urutan harus berupa bilangan bulat positif.";
  if (item.kind === "tryout" && Number(item.maxScore) < 76) return "Skor maksimal harus mendukung batas 19 per sesi.";
  if (item.passingScore !== "" && (!/^\d+(\.\d+)?$/.test(item.passingScore) || !Number.isFinite(Number(item.passingScore)) || Number(item.passingScore) > Number(item.maxScore))) return "Passing score harus antara 0 dan skor maksimal, atau kosong.";
  if (!["Draft", "Published"].includes(item.status)) return "Pilih status yang valid.";
  const questionIssue = item.questions.map((question) => assessmentQuestionError(question, item)).find(Boolean);
  if (questionIssue) return questionIssue;
  if (item.status === "Published") {
    if (!item.duration || item.passingScore === "") return "OPEN: isi durasi dan passing score sebelum publish.";
    if (!item.questions.some((question) => question.status === "Published")) return "Tambahkan soal Published sebelum publish.";
    if (item.kind === "tryout" && assessmentSections(item).some((section) => !item.questions.some((question) => question.section === section && question.status === "Published"))) return "Setiap sesi membutuhkan soal Published.";
    if (item.questions.some((question) => question.status === "Published" && ((question.type === "Audio" && !question.file) || (question.type === "Reading" && !question.passage.trim())))) return "OPEN: lengkapi file audio dan teks bacaan sebelum publish.";
  }
  return "";
}
