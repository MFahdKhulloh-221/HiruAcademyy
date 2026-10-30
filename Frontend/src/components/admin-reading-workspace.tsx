"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminShell } from "@/components/admin-primitives";
import { AdminJourneyHeader, AdminJourneyToolbar } from "@/components/admin-journey-toolbar";
import { AdminTryoutQuestionBuilder } from "@/components/admin-tryout-question-builder";
import { assessmentSections, type AdminAssessment } from "@/components/admin-assessment-fixtures";
import { useLearningRequest } from "@/components/learning-hooks";
import { adminLearningContext } from "@/lib/admin-learning-api";
import { apiRequest, ApiError } from "@/lib/api";
import { placementText } from "@/lib/placement-rich-text";

type Passage = { id: number; chapter_id: number; title: string; body: string; status: "draft" | "published" };
type Question = { id: number; reading_passage_id: number; question: string; options: Record<string, string>; correct_option: string; explanation: string | null; sort_order: number; status: "draft" | "published" };

function readingDraft(chapter: string, passages: Passage[], questions: Question[]): AdminAssessment {
  return { id: chapter, kind: "tryout", title: "Reading Question", context: "", chapter, session: "", part: "", duration: "", maxScore: "", passingScore: "", order: "0", status: "Draft", passages: passages.map(item => ({ id: String(item.id), title: item.title, body: item.body })), questions: questions.filter(item => passages.some(passage => passage.id === item.reading_passage_id)).map(item => ({ id: String(item.id), section: assessmentSections({ kind: "tryout", context: "" })[2], type: "Reading", prompt: item.question, instruction: "", answers: ["A", "B", "C", "D"].map(key => item.options[key]), correctAnswer: ["A", "B", "C", "D"].indexOf(item.correct_option), explanation: item.explanation ?? "", passage: "", passageId: String(item.reading_passage_id), file: null, order: String(item.sort_order), status: item.status === "published" ? "Published" : "Draft" })) };
}

export function AdminReadingWorkspace({ navigation, nested = false }: { navigation?: ReactNode; nested?: boolean }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const [context, passages, questions] = await Promise.all([adminLearningContext(signal), apiRequest<{ data: Passage[] }>("/api/admin/reading-passages", { signal }), apiRequest<{ data: Question[] }>("/api/admin/reading-questions", { signal })]);
    return { ...context, passages: passages.data, questions: questions.data };
  }, []);
  const request = useLearningRequest(load, "admin-reading-studio");
  const [program, setProgram] = useState("");
  const [chapter, setChapter] = useState("");
  const [draft, setDraft] = useState<AdminAssessment>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  const writing = useRef(false);
  const saved = useRef<AdminAssessment | undefined>(undefined);
  const passageStatus = useRef(new Map<string, Passage["status"]>());
  const chapters = request.data?.chapters.filter(item => request.data?.programs.find(p => p.id === item.program_id)?.family === "jlpt") ?? [];
  const selected = chapters.find(item => String(item.id) === chapter);
  const current = draft ?? readingDraft(chapter, request.data?.passages.filter(item => String(item.chapter_id) === chapter) ?? [], request.data?.questions ?? []);
  const withContext = { ...current, context: request.data?.programs.find(item => item.id === selected?.program_id)?.name ?? "" };
  function change(value: AdminAssessment) {
    if (writing.current) return;
    if (!saved.current) saved.current = current;
    setDraft(value); setDirty(true); setMessage(""); setError("");
  }
  function switchFilter(value: string, isProgram = false) {
    if (writing.current || (dirty && !window.confirm("Buang perubahan Reading yang belum disimpan?"))) return;
    if (isProgram) { setProgram(value); setChapter(""); } else setChapter(value);
    setDraft(undefined); saved.current = undefined; passageStatus.current.clear(); setDirty(false); setError(""); setMessage("");
  }
  async function persist(value: AdminAssessment, publish = false) {
    if (writing.current || !chapter) return;
    let next = { ...value, questions: value.questions.map(item => publish ? { ...item, status: "Published" as const } : item) };
    const invalidPassage = next.passages?.some(item => !item.title.trim() || item.title.length > 255 || !placementText(item.body).trim());
    const invalidQuestion = next.questions.some(item => !placementText(item.prompt).trim() || item.answers.length !== 4 || item.answers.some(answer => !placementText(answer).trim()) || !Number.isInteger(item.correctAnswer) || item.correctAnswer < 0 || item.correctAnswer > 3 || !/^\d+$/.test(item.order) || Number(item.order) > 2147483647 || !next.passages?.some(passage => passage.id === item.passageId));
    if (invalidPassage || invalidQuestion) { setError("Lengkapi judul dan teks bacaan, pertanyaan, pilihan A–D, kunci jawaban, dan urutan valid sebelum menyimpan."); return; }
    writing.current = true; setBusy(true); setError(""); setMessage("");
    // CRUD is not atomic: checkpoint each confirmed write so retries keep IDs and pending edits.
    let baseline = saved.current ?? current;
    const checkpoint = () => { saved.current = baseline; setDraft(next); };
    const write = async <T,>(resource: string, id: string, body: unknown) => (await apiRequest<{ data: T }>(`/api/admin/${resource}${/^\d+$/.test(id) ? `/${id}` : ""}`, { method: /^\d+$/.test(id) ? "PATCH" : "POST", body: JSON.stringify(body) })).data;
    try {
      for (const passage of next.passages ?? []) {
        const original = baseline.passages?.find(item => item.id === passage.id);
        const status = publish ? "published" : passageStatus.current.get(passage.id) ?? request.data?.passages.find(item => String(item.id) === passage.id)?.status ?? "draft";
        if (JSON.stringify(original) === JSON.stringify(passage) && !publish) continue;
        const result = await write<Passage>("reading-passages", passage.id, { chapter_id: Number(chapter), title: passage.title, body: passage.body, status });
        const replacement = { ...passage, id: String(result.id) };
        passageStatus.current.set(replacement.id, status);
        next = { ...next, passages: next.passages?.map(item => item.id === passage.id ? replacement : item), questions: next.questions.map(item => item.passageId === passage.id ? { ...item, passageId: replacement.id } : item) };
        baseline = { ...baseline, passages: [...baseline.passages?.filter(item => item.id !== passage.id) ?? [], replacement] }; checkpoint();
      }
      for (const question of next.questions) {
        if (JSON.stringify(baseline.questions.find(item => item.id === question.id)) === JSON.stringify(question)) continue;
        const result = await write<Question>("reading-questions", question.id, { reading_passage_id: Number(question.passageId), question: question.prompt, options: Object.fromEntries(question.answers.map((answer, index) => [["A", "B", "C", "D"][index], answer])), correct_option: ["A", "B", "C", "D"][question.correctAnswer], explanation: question.explanation, sort_order: Number(question.order), status: question.status.toLowerCase() });
        const replacement = { ...question, id: String(result.id) };
        next = { ...next, questions: next.questions.map(item => item.id === question.id ? replacement : item) };
        baseline = { ...baseline, questions: [...baseline.questions.filter(item => item.id !== question.id), replacement] }; checkpoint();
      }
      // Only explicit removals are deleted, after all retained content has saved successfully.
      for (const question of baseline.questions.filter(item => !next.questions.some(kept => kept.id === item.id))) {
        await apiRequest(`/api/admin/reading-questions/${question.id}`, { method: "DELETE" });
        baseline = { ...baseline, questions: baseline.questions.filter(item => item.id !== question.id) }; checkpoint();
      }
      for (const passage of baseline.passages?.filter(item => !next.passages?.some(kept => kept.id === item.id)) ?? []) {
        await apiRequest(`/api/admin/reading-passages/${passage.id}`, { method: "DELETE" });
        baseline = { ...baseline, passages: baseline.passages?.filter(item => item.id !== passage.id) }; checkpoint();
      }
      saved.current = next; setDraft(next); setDirty(false); setMessage(publish ? "Reading berhasil dipublikasikan." : "Semua perubahan Reading tersimpan."); request.retry();
    } catch (cause) {
      checkpoint(); setDirty(true);
      const detail = cause instanceof ApiError && Object.keys(cause.errors).length ? Object.values(cause.errors).flat().join(" ") : cause instanceof Error ? cause.message : "Permintaan gagal.";
      setError(`Penyimpanan belum selesai. Perubahan yang sudah berhasil tetap tersimpan; perubahan lain tetap di editor. Coba simpan lagi. ${detail}`);
    } finally { writing.current = false; setBusy(false); }
  }
  const content = <main className="admin-page curriculum-admin-page admin-learning-question-prototype">{navigation}{!nested && <AdminJourneyHeader tab="Reading Question" />}<fieldset disabled={busy}><AdminJourneyToolbar programs={request.data?.programs ?? []} chapters={chapters} program={program} chapter={chapter} onProgram={value => switchFilter(value, true)} onChapter={value => switchFilter(value)}>{null}</AdminJourneyToolbar></fieldset>{request.error && <p role="alert">{request.error}<button type="button" onClick={request.retry}>Coba Lagi</button></p>}{request.loading && !request.data ? <p role="status">Memuat Reading...</p> : !selected ? <p>Pilih program dan chapter untuk mengedit Reading.</p> : <AdminTryoutQuestionBuilder key={chapter} readingOnly studioTitle="Reading" saveLabel="Simpan Reading" draft={withContext} initialQuestion={null} onDirtyChange={ignoreDirtyChange} busy={busy} error={error} onChange={change} onSave={persist} onClose={() => switchFilter("")} onDelete={async () => {}} saveStatus={dirty ? "Perubahan belum disimpan" : message || "Tidak ada perubahan"} bulkAction={<button type="button" className="button" disabled={busy || !current.questions.length} onClick={() => void persist(withContext, true)}>Simpan & Publish Reading</button>} />}</main>;
  return nested ? content : <AdminShell current="/admin/reading-question">{content}</AdminShell>;
}

function ignoreDirtyChange() {}
