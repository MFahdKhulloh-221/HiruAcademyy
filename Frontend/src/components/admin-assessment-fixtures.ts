import { assessmentSessions } from "@/lib/assessment-attempt";
import type { AssessmentImage, AssessmentPassageBlock } from "@/lib/assessment-image";
import { passageBlocksError } from "@/lib/assessment-passage-blocks";
import { placementText } from "@/lib/placement-rich-text";
import type { AssessmentQuestion } from "@/lib/assessment-mock";
import { miniCheckpointConfig } from "@/lib/sensei-mock";
import { jlptTryoutSessions, tryoutQuestions } from "@/lib/tryout-mock";

export const assessmentLetters = ["A", "B", "C", "D"] as const;
export const miniAssessmentContexts = ["DASAR", "N5", "N4", "N3", "N2", "SSW"] as const;
export const tryoutAssessmentContexts = ["N5", "N4", "N3", "N2", "N1"] as const;
export type AdminAssessmentKind = "mini" | "tryout" | "checkpoint";
export type { AssessmentImage } from "@/lib/assessment-image";
export type AdminAssessmentQuestion = AssessmentImage & {
  passageId?: string | null;
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
  audioUrl?: string;
  pointValue?: number;
  order: string;
  status: "Draft" | "Published";
};
export type AdminAssessment = {
  studioRevision?: string;
  builderCapabilities?: { images: boolean; decimal_points: boolean };
  passages?: ({ id: string; title: string; body: string; blocks?: AssessmentPassageBlock[] | null } & AssessmentImage)[];
  accessType?: "free" | "membership";
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
  sessionPassingScores?: Record<string, number> | null;
  order: string;
  status: "Draft" | "Published";
  questions: AdminAssessmentQuestion[];
};

export function assessmentSections(item: Pick<AdminAssessment, "kind" | "context">): readonly string[] {
  return item.kind !== "mini" || !["DASAR", "SSW"].includes(item.context) ? jlptTryoutSessions : ["Chapter"];
}
export function orderedAssessmentQuestions(item: AdminAssessment) {
  const sections = assessmentSections(item);
  const sorted = [...item.questions].sort((a, b) => Number(a.order) - Number(b.order) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  return sections.flatMap((section) => sorted.filter((question) => question.section === section)).concat(sorted.filter((question) => !sections.includes(question.section)));
}
export function copyAssessment(item: AdminAssessment): AdminAssessment {
  return { ...item, passages: item.passages?.map(passage => ({ ...passage, ...(passage.blocks ? { blocks: passage.blocks.map(block => ({ ...block })) } : {}) })), questions: item.questions.map((question) => ({ ...question, answers: [...question.answers], japanese: question.japanese ? { ...question.japanese } : undefined })) };
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
export function assessmentImageError(content: AssessmentImage) {
  if (content.image && !content.image_alt?.trim()) return "Isi teks alternatif gambar.";
  if (content.image && content.image_position != null && !["before", "after"].includes(content.image_position)) return "Pilih posisi gambar sebelum atau sesudah teks.";
  return "";
}
export function assessmentPointValueError(value: number | undefined, kind: AdminAssessmentKind) {
  if (value === undefined || !Number.isFinite(value) || value < 1 || value > 180) return "Point value harus antara 1 dan 180.";
  if (kind === "tryout" ? ![0, 0.25, 0.5, 0.75].includes(value % 1) : !Number.isInteger(value)) return kind === "tryout" ? "Point value harus bilangan bulat atau berakhiran ,25 / ,50 / ,75." : "Point value harus bilangan bulat.";
  return "";
}
export function assessmentQuestionError(question: AdminAssessmentQuestion, item: AdminAssessment) {
  if (item.kind === "tryout" && item.builderCapabilities?.images && assessmentImageError(question)) return assessmentImageError(question);
  if (!assessmentSections(item).includes(question.section)) return "Pilih sesi yang valid.";
  if (!["Multiple choice", "Audio", "Reading"].includes(question.type) || (["DASAR", "SSW"].includes(item.context) && question.type !== "Multiple choice")) return "DASAR dan SSW hanya memakai Multiple choice.";
  if (!placementText(question.prompt).trim() || question.answers.length !== 4 || question.answers.some((answer) => !placementText(answer).trim())) return "Isi pertanyaan dan pilihan A–D.";
  if (!Number.isInteger(question.correctAnswer) || question.correctAnswer < 0 || question.correctAnswer > 3) return "Pilih jawaban benar A–D.";
  if (item.kind !== "mini" ? !/^\d+$/.test(question.order) || !Number.isSafeInteger(Number(question.order)) : !positiveInteger(question.order)) return item.kind !== "mini" ? "Urutan harus berupa bilangan bulat nonnegatif." : "Urutan harus berupa bilangan bulat positif.";
  if (!["Draft", "Published"].includes(question.status)) return "Pilih status yang valid.";
  if (item.kind !== "mini" && assessmentPointValueError(question.pointValue, item.kind)) return assessmentPointValueError(question.pointValue, item.kind);
  if (question.japanese?.reading && !question.japanese.text.trim()) return "Isi Teks Jepang.";
  if (!validAssessmentAudio(question.file)) return "Pilih file audio yang valid dan tidak kosong.";
  if (question.type !== "Audio" && question.file) return "File audio hanya untuk soal Audio.";
  if (question.passageId) {
    if (!item.passages?.some(passage => passage.id === question.passageId)) return "Grup bacaan tidak ditemukan.";
    if (question.section !== assessmentSections(item)[2] && !(item.kind === "tryout" && question.section === assessmentSections(item)[1])) return "Grup stimulus hanya untuk sesi Tata Bahasa Try Out atau Reading.";
    if (item.questions.some(linked => linked.passageId === question.passageId && linked.section !== question.section)) return "Satu grup stimulus tidak boleh terhubung ke sesi berbeda.";
  }
  if (question.type !== "Reading" && question.passage.trim()) return "Teks bacaan hanya untuk soal Reading.";
  return "";
}
export function assessmentQuestionLocation(question: AdminAssessmentQuestion, item: AdminAssessment) {
  const siblings = orderedAssessmentQuestions(item).filter(current => current.section === question.section);
  return `Sesi ${question.section || "belum dipilih"} — Soal ${siblings.findIndex(current => current.id === question.id) + 1}`;
}
export function assessmentPassageError(passage: { title: string; body: string; blocks?: AssessmentPassageBlock[] | null }) {
  const blocksError = passageBlocksError(passage.blocks);
  if (blocksError) return blocksError;
  if (!passage.title.trim()) return "Isi judul internal bacaan.";
  if ([...passage.title.trim()].length > 255) return "Judul internal bacaan maksimal 255 karakter. Pendekkan judul.";
  if (!placementText(passage.body).trim()) return "Isi teks bacaan bersama.";
  return "";
}
export function assessmentError(item: AdminAssessment) {
  const contexts: readonly string[] = item.kind === "mini" ? miniAssessmentContexts : tryoutAssessmentContexts;
  if (!contexts.includes(item.context) || !item.title.trim()) return "Isi judul dan pilih konteks yang valid.";
  if (item.kind === "mini" && (!item.chapter.trim() || !positiveInteger(item.session) || !["1", "2"].includes(item.part))) return "Isi chapter, sesi, dan part yang valid.";
  if (item.duration && !positiveInteger(item.duration)) return "Durasi harus berupa bilangan bulat positif.";
  if (!positiveInteger(item.maxScore) || !positiveInteger(item.order)) return "Skor maksimal dan urutan harus berupa bilangan bulat positif.";
  if (item.kind !== "mini") {
    if (item.passingScore !== "" && (!/^\d+$/.test(item.passingScore) || !Number.isSafeInteger(Number(item.passingScore)))) return "Passing score harus berupa bilangan bulat nonnegatif.";
    if (item.sessionPassingScores != null && (Object.keys(item.sessionPassingScores).length !== assessmentSessions.length || assessmentSessions.some(session => !Number.isSafeInteger(item.sessionPassingScores?.[session]) || item.sessionPassingScores![session] < 0))) return "Passing score per sesi harus berupa bilangan bulat nonnegatif.";
  }
  if (item.passingScore !== "" && (!/^\d+(\.\d+)?$/.test(item.passingScore) || !Number.isFinite(Number(item.passingScore)) || Number(item.passingScore) > Number(item.maxScore))) return "Passing score harus antara 0 dan skor maksimal, atau kosong.";
  if (!["Draft", "Published"].includes(item.status)) return "Pilih status yang valid.";
  const contentIssues = [
    ...(item.passages ?? []).flatMap((passage, index) => {
      const issue = assessmentPassageError(passage) || (item.kind === "tryout" && item.builderCapabilities?.images ? assessmentImageError(passage) : "");
      const linked = orderedAssessmentQuestions(item).filter(question => question.passageId === passage.id);
      return issue ? [`Bacaan ${index + 1} (${passage.title || "tanpa judul"})${linked.length ? ` — ${linked.map(question => assessmentQuestionLocation(question, item)).join(", ")}` : ""}: ${issue}`] : [];
    }),
    ...orderedAssessmentQuestions(item).flatMap(question => {
      const issue = assessmentQuestionError(question, item);
      return issue ? [`${assessmentQuestionLocation(question, item)}: ${issue}`] : [];
    }),
  ];
  if (contentIssues.length) return contentIssues.join("\n");
  if (item.status === "Published" && item.kind !== "mini") {
    const published = item.questions.filter(question => question.status === "Published");
    if (published.reduce((total, question) => total + (question.pointValue ?? 0), 0) !== Number(item.maxScore)) return `Total poin soal Published saat ini: ${published.reduce((total, question) => total + (question.pointValue ?? 0), 0)} dari ${item.maxScore}. Lengkapi poin sebelum mempublikasikan ${item.kind === "checkpoint" ? "Checkpoint" : "Try Out"}.`;
    if (item.sessionPassingScores && assessmentSessions.some((session, index) => {
      const maximum = published.filter(question => question.section === jlptTryoutSessions[index]).reduce((total, question) => total + (question.pointValue ?? 0), 0);
      return item.sessionPassingScores![session] > (item.kind === "tryout" ? Math.round(maximum) : maximum);
    })) return "Passing score per sesi harus antara 0 dan skor maksimal sesi.";
  }
  if (item.status === "Published") {
    if (item.kind === "mini" && (!item.duration || item.passingScore === "")) return "OPEN: isi durasi dan passing score sebelum publish.";
    if (!item.questions.some((question) => question.status === "Published")) return "Tambahkan soal Published sebelum publish.";
    if (item.kind !== "mini" && assessmentSections(item).some((section) => !item.questions.some((question) => question.section === section && question.status === "Published"))) return "Setiap sesi membutuhkan soal Published.";
    const missingMedia = orderedAssessmentQuestions(item).filter(question => question.status === "Published" && ((question.type === "Audio" && !question.file && !question.audioUrl?.trim()) || (question.type === "Reading" && !question.passageId && !placementText(question.passage).trim())));
    if (missingMedia.length) return missingMedia.map(question => `${assessmentQuestionLocation(question, item)}: ${question.type === "Audio" ? "Unggah audio atau isi URL audio" : "Isi teks bacaan"} sebelum publish.`).join("\n");
  }
  return "";
}
