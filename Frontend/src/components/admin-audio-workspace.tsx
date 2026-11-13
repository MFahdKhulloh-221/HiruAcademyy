"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminShell } from "@/components/admin-primitives";
import { AdminChapterStudioSelection } from "@/components/admin-chapter-studio-selection";
import { AdminJourneyHeader, AdminJourneyToolbar } from "@/components/admin-journey-toolbar";
import { AdminTryoutQuestionBuilder } from "@/components/admin-tryout-question-builder";
import { assessmentSections, type AdminAssessment } from "@/components/admin-assessment-fixtures";
import { useLearningRequest } from "@/components/learning-hooks";
import { adminLearningContext } from "@/lib/admin-learning-api";
import { apiRequest, ApiError } from "@/lib/api";
import { rememberAdminMedia } from "@/lib/admin-media";
import { placementText } from "@/lib/placement-rich-text";

type AudioQuestion = { id: number; chapter_id: number; title: string | null; audio_url: string | null; question: string; options: Record<string, string>; correct_option: string; explanation: string | null; sort_order: number; status: "draft" | "published" };
const letters = ["A", "B", "C", "D"];
function audioDraft(chapter: string, questions: AudioQuestion[]): AdminAssessment {
  return { id: chapter, kind: "tryout", title: "Audio Question", context: "", chapter, session: "", part: "", duration: "", maxScore: "", passingScore: "", order: "0", status: "Draft", questions: questions.filter(item => String(item.chapter_id) === chapter).map(item => ({ id: String(item.id), section: assessmentSections({ kind: "tryout", context: "" })[3], type: "Audio", audioTitle: item.title ?? "", audioUrl: item.audio_url ?? "", prompt: item.question, instruction: "", answers: letters.map(key => item.options[key] ?? ""), correctAnswer: letters.indexOf(item.correct_option), explanation: item.explanation ?? "", passage: "", file: null, order: String(item.sort_order), status: item.status === "published" ? "Published" : "Draft" })) };
}

export function AdminAudioWorkspace({ navigation, nested = false }: { navigation?: ReactNode; nested?: boolean }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const [context, questions] = await Promise.all([adminLearningContext(signal), apiRequest<{ data: AudioQuestion[] }>("/api/admin/audio-questions", { signal })]);
    questions.data.forEach(item => rememberAdminMedia(item));
    return { ...context, questions: questions.data };
  }, []);
  const request = useLearningRequest(load, "admin-audio-studio");
  const [program, setProgram] = useState("");
  const [chapter, setChapter] = useState("");
  const [draft, setDraft] = useState<AdminAssessment>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const writing = useRef(false);
  const pendingUpload = useRef(false);
  const saved = useRef<AdminAssessment | undefined>(undefined);
  useEffect(() => {
    if (!dirty && !busy && !uploading) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy, uploading]);
  const chapters = request.data?.chapters.filter(item => request.data?.programs.find(p => p.id === item.program_id)?.family === "jlpt") ?? [];
  const selected = chapters.find(item => String(item.id) === chapter);
  const current = draft ?? audioDraft(chapter, request.data?.questions ?? []);
  const withContext = { ...current, context: request.data?.programs.find(item => item.id === selected?.program_id)?.name ?? "" };
  function change(value: AdminAssessment) {
    if (writing.current) return;
    if (!saved.current) saved.current = current;
    setDraft(value); setDirty(true); setMessage(""); setError("");
  }
  function uploadBusy(value: boolean) { pendingUpload.current = value; setUploading(value); }
  function switchFilter(value: string, isProgram = false) {
    if (writing.current || pendingUpload.current || (dirty && !window.confirm("Buang perubahan Audio yang belum disimpan?"))) return;
    if (isProgram) { setProgram(value); setChapter(""); } else setChapter(value);
    setDraft(undefined); saved.current = undefined; setDirty(false); setError(""); setMessage("");
  }
  async function persist(value: AdminAssessment, publish = false) {
    if (writing.current || pendingUpload.current || !chapter) return;
    let next = { ...value, questions: value.questions.map(item => publish ? { ...item, status: "Published" as const } : item) };
    if (next.questions.some(item => (item.audioTitle?.length ?? 0) > 255 || !placementText(item.prompt).trim() || item.answers.length !== 4 || item.answers.some(answer => !placementText(answer).trim()) || !Number.isInteger(item.correctAnswer) || item.correctAnswer < 0 || item.correctAnswer > 3 || !/^\d+$/.test(item.order) || Number(item.order) > 2147483647)) {
      setError("Lengkapi pertanyaan, pilihan A–D, kunci jawaban, urutan valid, dan judul maksimal 255 karakter sebelum menyimpan."); return;
    }
    writing.current = true; setBusy(true); setError(""); setMessage("");
    // CRUD is not atomic: checkpoint confirmed IDs and deletes before allowing retry.
    let baseline = saved.current ?? current;
    const checkpoint = () => { saved.current = baseline; setDraft(next); };
    try {
      for (const question of next.questions) {
        if (JSON.stringify(baseline.questions.find(item => item.id === question.id)) === JSON.stringify(question)) continue;
        const existing = /^\d+$/.test(question.id);
        const result = (await apiRequest<{ data: AudioQuestion }>(`/api/admin/audio-questions${existing ? `/${question.id}` : ""}`, { method: existing ? "PATCH" : "POST", body: JSON.stringify({ chapter_id: Number(chapter), title: question.audioTitle, audio_url: question.audioUrl, question: question.prompt, options: Object.fromEntries(question.answers.map((answer, index) => [letters[index], answer])), correct_option: letters[question.correctAnswer], explanation: question.explanation, sort_order: Number(question.order), status: question.status.toLowerCase() }) })).data;
        const replacement = { ...question, id: String(result.id) };
        next = { ...next, questions: next.questions.map(item => item.id === question.id ? replacement : item) };
        baseline = { ...baseline, questions: [...baseline.questions.filter(item => item.id !== question.id), replacement] }; checkpoint();
      }
      for (const question of baseline.questions.filter(item => !next.questions.some(kept => kept.id === item.id))) {
        await apiRequest(`/api/admin/audio-questions/${question.id}`, { method: "DELETE" });
        baseline = { ...baseline, questions: baseline.questions.filter(item => item.id !== question.id) }; checkpoint();
      }
      saved.current = next; setDraft(next); setDirty(false); setMessage(publish ? "Audio berhasil dipublikasikan." : "Semua perubahan Audio tersimpan."); request.retry();
    } catch (cause) {
      checkpoint(); setDirty(true);
      const detail = cause instanceof ApiError && Object.keys(cause.errors).length ? Object.values(cause.errors).flat().join(" ") : cause instanceof Error ? cause.message : "Permintaan gagal.";
      setError(`Penyimpanan belum selesai. Perubahan yang sudah berhasil tetap tersimpan; perubahan lain tetap di editor. Coba simpan lagi. ${detail}`);
    } finally { writing.current = false; setBusy(false); }
  }
  const content = <main className="admin-page curriculum-admin-page admin-learning-question-prototype">{navigation}{!nested && <AdminJourneyHeader tab="Audio Question" />}<AdminChapterStudioSelection kind="Audio" selected={Boolean(selected)} disabled={busy || uploading}><AdminJourneyToolbar singleChapter programs={request.data?.programs ?? []} chapters={chapters} program={program} chapter={chapter} onProgram={value => switchFilter(value, true)} onChapter={value => switchFilter(value)}>{null}</AdminJourneyToolbar></AdminChapterStudioSelection>{request.error && <p role="alert">{request.error}<button type="button" onClick={request.retry}>Coba Lagi</button></p>}{request.loading && !request.data ? <p role="status">Memuat Audio...</p> : !selected ? null : <AdminTryoutQuestionBuilder key={chapter} audioOnly studioTitle="Audio" saveLabel="Simpan Audio" draft={withContext} initialQuestion={null} onDirtyChange={ignoreDirtyChange} onUploadBusyChange={uploadBusy} busy={busy} error={error} onChange={change} onSave={persist} onClose={() => switchFilter("")} onDelete={async () => {}} saveStatus={dirty ? "Perubahan belum disimpan" : message || "Tidak ada perubahan"} bulkAction={<button type="button" className="button" disabled={busy || uploading || !current.questions.length} onClick={() => void persist(withContext, true)}>Simpan & Publish Audio</button>} />}</main>;
  return nested ? content : <AdminShell current="/admin/audio-question">{content}</AdminShell>;
}
function ignoreDirtyChange() {}
