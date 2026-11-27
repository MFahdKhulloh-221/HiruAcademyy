"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminDialog, AdminShell } from "@/components/admin-primitives";
import { AdminJourneyHeader, AdminJourneyToolbar } from "@/components/admin-journey-toolbar";
import { AdminTryoutQuestionBuilder } from "@/components/admin-tryout-question-builder";
import { assessmentSections, type AdminAssessment } from "@/components/admin-assessment-fixtures";
import { useLearningRequest } from "@/components/learning-hooks";
import { adminLearningContext } from "@/lib/admin-learning-api";
import { apiRequest, ApiError } from "@/lib/api";
import { rememberAdminMedia } from "@/lib/admin-media";
import { placementText } from "@/lib/placement-rich-text";
import styles from "./admin-placement-builder.module.css";
import layout from "./admin-mini-checkpoint.module.css";

type Category = "vocabulary" | "grammar" | "reading" | "audio";
type Passage = { id: string | number; title: string; body: string };
type Question = { id: number; updated_at: string; chapter_id: number; category: Category | null; instruction: string | null; image_url: string | null; image_alt?: string | null; image_position?: "before" | "after" | null; image_resolved_url?: string | null; audio_url: string | null; passage: Passage | null; question: string; options: Record<string, string>; correct_option: string; explanation: string | null; sort_order: number; status: "draft" | "published" };
const categories: Category[] = ["vocabulary", "grammar", "reading", "audio"];
const letters = ["A", "B", "C", "D"];
const endpoint = "/api/admin/mini-checkpoint-questions";
const sections = assessmentSections({ kind: "mini", context: "" });
function toDraft(chapter: string, questions: Question[]): AdminAssessment {
  const rows = questions.filter(item => String(item.chapter_id) === chapter);
  return { id: chapter, kind: "mini", title: "Mini Checkpoint", context: "", chapter, session: "", part: "", duration: "", maxScore: "100", passingScore: "", order: "0", status: rows.some(item => item.status === "published") ? "Published" : "Draft", builderCapabilities: { images: true, decimal_points: false }, passages: Array.from(new Map(rows.flatMap(item => item.passage ? [[String(item.passage.id), { ...item.passage, id: String(item.passage.id) }] as const] : [])).values()), questions: rows.map(item => ({ id: String(item.id), miniCategory: item.category ?? null, section: sections[Math.max(0, categories.indexOf(item.category!))], type: item.category === "audio" ? "Audio" : item.category === "reading" ? "Reading" : "Multiple choice", prompt: item.question, instruction: item.instruction ?? "", answers: letters.map(key => item.options[key] ?? ""), correctAnswer: letters.indexOf(item.correct_option), explanation: item.explanation ?? "", image: item.image_url, image_alt: item.image_alt ?? null, image_position: item.image_position ?? "before", image_resolved_url: item.image_resolved_url, audioUrl: item.audio_url ?? "", passage: "", passageId: item.passage ? String(item.passage.id) : null, file: null, order: String(item.sort_order), status: item.status === "published" ? "Published" : "Draft" })) };
}
function readinessReasons(errors: Record<string, string[]> | []) {
  const translations: Record<string, string> = {
    "Publish at least one Mini Checkpoint question.": "Terbitkan minimal satu soal Mini Checkpoint.",
    "Questions sharing a passage ID must share its title and body.": "Soal dalam grup bacaan yang sama harus memakai judul dan teks bacaan yang sama.",
    "Audio questions require an audio URL before publishing.": "Soal audio yang diterbitkan wajib memiliki audio.",
    "Reading questions require a passage before publishing.": "Soal reading yang diterbitkan wajib memiliki bacaan.",
    "Mini Checkpoint requires an N5–N2 program.": "Mini Checkpoint hanya tersedia untuk program N5–N2.",
  };
  return Object.entries(errors).flatMap(([field, messages]) => {
    if (field === "duration_minutes") return ["Durasi Mini Checkpoint wajib berupa menit positif."];
    if (field === "passing_score") return ["Nilai minimal lulus Mini Checkpoint wajib diisi antara 0–100."];
    const question = /^questions\.(\d+)\.(.+)$/.exec(field);
    const labels: Record<string, string> = { question: "pertanyaan", options: "pilihan jawaban", correct_option: "kunci jawaban", passage: "bacaan", image_alt: "teks alternatif gambar", audio_url: "audio", category: "kategori", sort_order: "urutan" };
    const parts = (question?.[2] ?? field).split(".");
    const label = [labels[parts[0]] ?? parts[0], ...parts.slice(1)].join(" ");
    return messages.map(message => `${question ? `Soal ID ${question[1]} (${label}): ` : ""}${translations[message] ?? `Data ${label} belum lengkap atau tidak valid. Periksa isian lalu simpan kembali.`}`);
  });
}
function errorMessage(cause: unknown) { return cause instanceof ApiError && Object.keys(cause.errors).length ? Object.values(cause.errors).flat().join(" ") : cause instanceof Error ? cause.message : "Permintaan gagal."; }

export function AdminMiniCheckpointWorkspace({ navigation, nested = false }: { navigation?: ReactNode; nested?: boolean }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const [context, questions] = await Promise.all([adminLearningContext(signal), apiRequest<{ data: Question[] }>(endpoint, { signal })]);
    questions.data.forEach(item => rememberAdminMedia(item));
    return { ...context, questions: questions.data };
  }, []);
  const request = useLearningRequest(load, "admin-mini-checkpoint-studio");
  const [saveConfirm, setSaveConfirm] = useState(false);
  const saveDraft = useRef<AdminAssessment | undefined>(undefined);
  const [notice, setNotice] = useState<{ title: string; text: string }>();
  const savedQuestions = useRef<Question[] | undefined>(undefined);
  const [program, setProgram] = useState("");
  const [chapter, setChapter] = useState("");
  const [draft, setDraft] = useState<AdminAssessment>();
  const [savedByChapter, setSavedByChapter] = useState<Record<string, Question[]>>({});
  const [questionIdMap, setQuestionIdMap] = useState<Record<string, string>>({});
  const loadReadiness = useCallback(async (signal: AbortSignal) => {
    if (!chapter) return null;
    const result = await apiRequest<{ data: { status: string; mini_checkpoint_readiness_errors: Record<string, string[]> | [] } }>(`/api/admin/chapters/${chapter}`, { signal });
    return { reasons: readinessReasons(result.data.mini_checkpoint_readiness_errors), chapterPublished: result.data.status === "published" };
  }, [chapter]);
  const readiness = useLearningRequest(loadReadiness, `mini-readiness-${chapter}`);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<{ duration: string; passing: string }>();
  const [savedSettings, setSavedSettings] = useState<Record<string, { duration: string; passing: string }>>({});
  const writing = useRef(false);
  const pendingUpload = useRef(false);
  useEffect(() => {
    if (!dirty && !busy && !uploading && !settings) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy, uploading, settings]);
  const selected = request.data?.chapters.find(item => String(item.id) === chapter);
  const persistedQuestions = savedByChapter[chapter] ?? request.data?.questions.filter(item => String(item.chapter_id) === chapter) ?? [];
  const current = draft ?? toDraft(chapter, persistedQuestions);
  const config = savedSettings[chapter] ?? { duration: String(selected?.mini_checkpoint_duration_minutes ?? ""), passing: String(selected?.mini_checkpoint_passing_score ?? "") };
  const configured = Number.isSafeInteger(Number(config.duration)) && Number(config.duration) > 0 && config.passing !== "" && Number.isSafeInteger(Number(config.passing)) && Number(config.passing) >= 0 && Number(config.passing) <= 100;
  const withContext = { ...current, status: current.questions.some(item => item.status === "Published") ? "Published" as const : "Draft" as const, context: request.data?.programs.find(item => item.id === selected?.program_id)?.name ?? "", duration: config.duration, passingScore: config.passing };
  function change(value: AdminAssessment) {
    if (writing.current) return;
    savedQuestions.current ??= persistedQuestions;
    const standalone = value.questions.filter(item => placementText(item.passage).trim() && !item.passageId);
    setDraft({ ...value, passages: [...value.passages ?? [], ...standalone.map(item => ({ id: `mini-passage-${item.id}`, title: "Bacaan mandiri", body: item.passage }))], questions: value.questions.map(item => standalone.includes(item) ? { ...item, passageId: `mini-passage-${item.id}`, passage: "" } : item) }); setDirty(true); setError(""); setMessage("");
  }
  function switchFilter(value: string, isProgram = false) {
    if (writing.current || pendingUpload.current || ((dirty || settings) && !window.confirm("Buang perubahan Mini Checkpoint yang belum disimpan?"))) return;
    if (isProgram) { setProgram(value); setChapter(""); } else setChapter(value);
    savedQuestions.current = undefined; setDraft(undefined); setQuestionIdMap({}); setSettings(undefined); setDirty(false); setError(""); setMessage("");
  }
  function requestSave(value: AdminAssessment) {
    saveDraft.current = value;
    setSaveConfirm(true);
  }
  async function saveSettings() {
    if (!settings || writing.current || pendingUpload.current || !selected) return;
    const duration = Number(settings.duration), passing = Number(settings.passing);
    if (!settings.duration.trim() || !settings.passing.trim() || !Number.isSafeInteger(duration) || duration < 1 || !Number.isSafeInteger(passing) || passing < 0 || passing > 100) { setError("Isi durasi positif dalam menit dan nilai minimal lulus 0–100."); return; }
    writing.current = true; setBusy(true); setError("");
    try {
      const result = await apiRequest<{ data: { mini_checkpoint_duration_minutes: number; mini_checkpoint_passing_score: number } }>(`/api/admin/chapters/${selected.id}`, { method: "PATCH", body: JSON.stringify({ mini_checkpoint_duration_minutes: duration, mini_checkpoint_passing_score: passing }) });
      setSavedSettings(previous => ({ ...previous, [chapter]: { duration: String(result.data.mini_checkpoint_duration_minutes), passing: String(result.data.mini_checkpoint_passing_score) } })); setSettings(undefined); setMessage("Pengaturan chapter tersimpan."); readiness.retry();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { writing.current = false; setBusy(false); }
  }
  async function persist(value: AdminAssessment) {
    if (writing.current || pendingUpload.current || !selected) return;
    const next = value;
    const fail = (text: string) => { setError(text); setNotice({ title: "Mini Checkpoint belum disimpan", text }); };
    if (next.questions.some(item => item.image && !item.image_alt?.trim())) { fail("Isi teks alternatif setiap gambar soal."); return; }
    if (next.questions.some(item => !placementText(item.prompt).trim() || item.answers.length !== 4 || item.answers.some(answer => !placementText(answer).trim()) || !Number.isInteger(item.correctAnswer) || item.correctAnswer < 0 || item.correctAnswer > 3 || !/^\d+$/.test(item.order) || Number(item.order) > 2147483647 || (item.passageId && !next.passages?.some(p => p.id === item.passageId)))) { fail("Lengkapi pertanyaan, pilihan A–D, kunci jawaban, urutan valid, dan grup bacaan."); return; }
    if (next.passages?.some(p => !p.title.trim() || p.title.length > 255 || !placementText(p.body).trim())) { fail("Isi judul (maksimal 255 karakter) dan teks setiap grup bacaan."); return; }
    if (next.questions.some(item => item.status === "Published") && (!configured || settings)) { fail("Buka Pengaturan Mini Checkpoint, lalu simpan durasi dan nilai minimal lulus sebelum menerbitkan soal."); return; }
    if (next.questions.some(item => item.status === "Published" && ((item.miniCategory === "audio" && !item.audioUrl?.trim()) || (item.miniCategory === "reading" && !item.passageId)))) { fail("Tambahkan audio pada soal menyimak dan bacaan pada soal reading sebelum menerbitkan."); return; }
    writing.current = true; setBusy(true); setError(""); setMessage("");
    const body = (item: AdminAssessment["questions"][number], owner: AdminAssessment) => {
      const passage = owner.passages?.find(p => p.id === item.passageId);
      return { chapter_id: selected.id, category: item.miniCategory ?? null, instruction: item.instruction || null, image_url: item.image || null, image_alt: item.image ? item.image_alt || null : null, image_position: item.image ? item.image_position ?? "before" : null, audio_url: item.audioUrl || null, passage: passage ? { id: passage.id, title: passage.title, body: passage.body } : null, question: item.prompt, options: Object.fromEntries(item.answers.map((answer, index) => [letters[index], answer])), correct_option: letters[item.correctAnswer], explanation: item.explanation || null, sort_order: Number(item.order), status: item.status.toLowerCase() };
    };
    try {
      const expected = savedQuestions.current ?? persistedQuestions;
      const result = await apiRequest<{ data: (Question & { client_id: string })[] }>(`${endpoint}/batch`, { method: "POST", body: JSON.stringify({ chapter_id: selected.id, expected_questions: expected.map(item => ({ id: item.id, updated_at: item.updated_at })), questions: next.questions.map(item => ({ ...body(item, next), client_id: item.id, ...(/^\d+$/.test(item.id) ? { id: Number(item.id) } : {}) })) }) });
      const saved = toDraft(chapter, result.data);
      savedQuestions.current = result.data;
      setSavedByChapter(previous => ({ ...previous, [chapter]: result.data }));
      setQuestionIdMap(previous => {
        const mapping = Object.fromEntries(result.data.map(item => [item.client_id, String(item.id)]));
        return { ...Object.fromEntries(Object.entries(previous).map(([clientId, id]) => [clientId, mapping[id] ?? id])), ...mapping };
      });
      setDraft(saved); setDirty(false);
      const published = result.data.filter(item => item.status === "published").length;
      const text = `Perubahan Mini Checkpoint berhasil disimpan: ${published} soal Terbit, ${result.data.length - published} soal Draft. Akses siswa tetap mengikuti kesiapan chapter dan keanggotaan.`;
      setMessage(text); setNotice({ title: "Mini Checkpoint berhasil disimpan", text }); readiness.retry();
    } catch (cause) {
      setDraft(value); setDirty(true);
      fail(cause instanceof ApiError && cause.status === 409 ? "Data chapter sudah berubah sejak editor dibuka. Isian Anda tetap di editor. Salin perubahan yang diperlukan, lalu muat ulang halaman sebelum menyimpan kembali." : `Penyimpanan belum dapat dikonfirmasi. Isian Anda tetap di editor; jangan muat ulang halaman. ${errorMessage(cause)}`);
    }
    finally { writing.current = false; setBusy(false); }
  }
  const content = <main className={`admin-page curriculum-admin-page admin-learning-question-prototype ${layout.page}`}>{navigation}{!nested && <AdminJourneyHeader tab="Mini Checkpoint" />}<div inert={busy || uploading}><AdminJourneyToolbar singleChapter programs={request.data?.programs ?? []} chapters={request.data?.chapters ?? []} program={program} chapter={chapter} onProgram={value => switchFilter(value, true)} onChapter={value => switchFilter(value)}>{selected && <button type="button" className="button button-primary" onClick={() => setSettings(config)}>Pengaturan Mini Checkpoint</button>}</AdminJourneyToolbar></div>{request.error && <p role="alert">{request.error}<button type="button" onClick={request.retry}>Coba Lagi</button></p>}{request.loading && !request.data && <p role="status">Memuat Mini Checkpoint...</p>}{selected && <><section className={layout.readiness} aria-label="Kesiapan Mini Checkpoint" aria-live="polite"><strong>Kesiapan konten Mini Checkpoint (data tersimpan)</strong>{readiness.loading ? <p>Memuat kesiapan Mini Checkpoint...</p> : readiness.error ? <p role="alert">{readiness.error}<button type="button" className="button" onClick={readiness.retry}>Coba Lagi</button></p> : readiness.data ? <>{readiness.data.reasons.length ? <><p>Konten belum siap.</p><ul>{readiness.data.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></> : <p>Konten Mini Checkpoint siap.</p>}{readiness.data.chapterPublished ? <p>Akses siswa tetap mengikuti kesiapan konten, aturan chapter, dan keanggotaan.</p> : <p>Chapter belum terbit, belum tersedia untuk siswa.</p>}</> : <p>Kesiapan belum tersedia.</p>}{dirty && <p>Perubahan editor belum disimpan; kesiapan belum mencerminkan perubahan ini.</p>}</section>{settings && <form className={styles.form} onSubmit={event => { event.preventDefault(); void saveSettings(); }}><fieldset disabled={busy || uploading} className={styles.fields}><legend>Pengaturan chapter</legend><label className="admin-field">Durasi (menit)<input required type="number" min="1" step="1" value={settings.duration} onChange={event => setSettings({ ...settings, duration: event.target.value })} /></label><label className="admin-field">Nilai minimal lulus (%)<input required type="number" min="0" max="100" step="1" value={settings.passing} onChange={event => setSettings({ ...settings, passing: event.target.value })} /></label><button type="submit" className="button button-primary">Simpan Pengaturan</button><button type="button" className="button" onClick={() => setSettings(undefined)}>Batal</button></fieldset></form>}<AdminTryoutQuestionBuilder key={chapter} studioTitle="Mini Checkpoint" saveLabel="Simpan Perubahan" questionIdMap={questionIdMap} draft={withContext} initialQuestion={null} onDirtyChange={ignoreDirtyChange} onUploadBusyChange={value => { pendingUpload.current = value; setUploading(value); }} busy={busy} error={error} onChange={change} onSave={async value => { requestSave(value); }} onClose={() => switchFilter("")} onDelete={async () => {}} saveStatus={dirty ? "" : message || ""}  /><AdminDialog className={layout.publishDialog} open={saveConfirm} title="Simpan perubahan Mini Checkpoint?" close={() => { if (!busy) setSaveConfirm(false); }} actions={<><button type="button" className="button button-secondary" disabled={busy} onClick={() => setSaveConfirm(false)}>Batal</button><button type="button" className="button button-primary" disabled={busy || uploading} onClick={() => { setSaveConfirm(false); void persist(saveDraft.current ?? withContext); }}>Ya, Simpan</button></>}><div className={layout.publishSummary}><strong>Chapter {selected.chapter_number} · {selected.title}</strong><span>{current.questions.filter(item => item.status === "Published").length} soal Terbit · {current.questions.filter(item => item.status === "Draft").length} soal Draft</span></div><p>Seluruh perubahan disimpan sesuai status masing-masing soal. Soal Draft tetap Draft.</p><p>Pastikan soal, kunci jawaban, durasi, dan nilai minimal lulus sudah benar sebelum melanjutkan.</p></AdminDialog></>}{!selected && error && <p role="alert">{error}</p>}<AdminDialog className={layout.publishDialog} open={!!notice} title={notice?.title ?? "Hasil penyimpanan"} close={() => setNotice(undefined)} actions={<button type="button" className="button button-primary" onClick={() => setNotice(undefined)}>Mengerti</button>}><p role="status">{notice?.text}</p></AdminDialog></main>;
  return nested ? content : <AdminShell current="/admin/mini-checkpoint">{content}</AdminShell>;
}
function ignoreDirtyChange() {}
