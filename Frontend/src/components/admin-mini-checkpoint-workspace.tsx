"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminAssessmentPreview } from "@/components/admin-assessment-preview";
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

type Category = "vocabulary" | "grammar" | "reading" | "audio";
type Passage = { id: string | number; title: string; body: string };
type Question = { id: number; chapter_id: number; category: Category | null; instruction: string | null; image_url: string | null; image_alt?: string | null; image_position?: "before" | "after" | null; image_resolved_url?: string | null; audio_url: string | null; passage: Passage | null; question: string; options: Record<string, string>; correct_option: string; explanation: string | null; sort_order: number; status: "draft" | "published" };
const categories: Category[] = ["vocabulary", "grammar", "reading", "audio"];
const letters = ["A", "B", "C", "D"];
const endpoint = "/api/admin/mini-checkpoint-questions";
const sections = assessmentSections({ kind: "mini", context: "" });
function toDraft(chapter: string, questions: Question[]): AdminAssessment {
  const rows = questions.filter(item => String(item.chapter_id) === chapter);
  return { id: chapter, kind: "mini", title: "Mini Checkpoint", context: "", chapter, session: "", part: "", duration: "", maxScore: "100", passingScore: "", order: "0", status: "Draft", builderCapabilities: { images: true, decimal_points: false }, passages: Array.from(new Map(rows.flatMap(item => item.passage ? [[String(item.passage.id), { ...item.passage, id: String(item.passage.id) }] as const] : [])).values()), questions: rows.map(item => ({ id: String(item.id), miniCategory: item.category ?? null, section: sections[Math.max(0, categories.indexOf(item.category!))], type: item.category === "audio" ? "Audio" : item.category === "reading" ? "Reading" : "Multiple choice", prompt: item.question, instruction: item.instruction ?? "", answers: letters.map(key => item.options[key] ?? ""), correctAnswer: letters.indexOf(item.correct_option), explanation: item.explanation ?? "", image: item.image_url, image_alt: item.image_alt ?? null, image_position: item.image_position ?? "before", image_resolved_url: item.image_resolved_url, audioUrl: item.audio_url ?? "", passage: "", passageId: item.passage ? String(item.passage.id) : null, file: null, order: String(item.sort_order), status: item.status === "published" ? "Published" : "Draft" })) };
}
function errorMessage(cause: unknown) { return cause instanceof ApiError && Object.keys(cause.errors).length ? Object.values(cause.errors).flat().join(" ") : cause instanceof Error ? cause.message : "Permintaan gagal."; }

export function AdminMiniCheckpointWorkspace({ navigation, nested = false }: { navigation?: ReactNode; nested?: boolean }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const [context, questions] = await Promise.all([adminLearningContext(signal), apiRequest<{ data: Question[] }>(endpoint, { signal })]);
    questions.data.forEach(item => rememberAdminMedia(item));
    return { ...context, questions: questions.data };
  }, []);
  const request = useLearningRequest(load, "admin-mini-checkpoint-studio");
  const [preview, setPreview] = useState(false);
  const [program, setProgram] = useState("");
  const [chapter, setChapter] = useState("");
  const [draft, setDraft] = useState<AdminAssessment>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [readiness, setReadiness] = useState<string[]>();
  const [readinessVersion, setReadinessVersion] = useState(0);
  useEffect(() => {
    setReadiness(undefined);
    if (!chapter) return;
    const controller = new AbortController();
    apiRequest<{ data: { mini_checkpoint_readiness_errors?: Record<string, string[]> | [] } }>(`/api/admin/chapters/${chapter}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setReadiness(Object.values(result.data.mini_checkpoint_readiness_errors ?? {}).flat()); }).catch(cause => { if (!controller.signal.aborted) setReadiness([errorMessage(cause)]); });
    return () => controller.abort();
  }, [chapter, readinessVersion]);
  const [settings, setSettings] = useState<{ duration: string; passing: string }>();
  const [savedSettings, setSavedSettings] = useState<Record<string, { duration: string; passing: string }>>({});
  const writing = useRef(false);
  const pendingUpload = useRef(false);
  const baseline = useRef<AdminAssessment | undefined>(undefined);
  useEffect(() => {
    if (!dirty && !busy && !uploading && !settings) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy, uploading, settings]);
  const selected = request.data?.chapters.find(item => String(item.id) === chapter);
  const current = draft ?? toDraft(chapter, request.data?.questions ?? []);
  const config = savedSettings[chapter] ?? { duration: String(selected?.mini_checkpoint_duration_minutes ?? ""), passing: String(selected?.mini_checkpoint_passing_score ?? "") };
  const configured = Number.isSafeInteger(Number(config.duration)) && Number(config.duration) > 0 && config.passing !== "" && Number.isSafeInteger(Number(config.passing)) && Number(config.passing) >= 0 && Number(config.passing) <= 100;
  const withContext = { ...current, context: request.data?.programs.find(item => item.id === selected?.program_id)?.name ?? "", duration: config.duration, passingScore: config.passing };
  function change(value: AdminAssessment) {
    if (writing.current) return;
    if (!baseline.current) baseline.current = current;
    const standalone = value.questions.filter(item => placementText(item.passage).trim() && !item.passageId);
    setDraft({ ...value, passages: [...value.passages ?? [], ...standalone.map(item => ({ id: `mini-passage-${item.id}`, title: "Bacaan mandiri", body: item.passage }))], questions: value.questions.map(item => standalone.includes(item) ? { ...item, passageId: `mini-passage-${item.id}`, passage: "" } : item) }); setDirty(true); setError(""); setMessage("");
  }
  function switchFilter(value: string, isProgram = false) {
    if (writing.current || pendingUpload.current || ((dirty || settings) && !window.confirm("Buang perubahan Mini Checkpoint yang belum disimpan?"))) return;
    if (isProgram) { setProgram(value); setChapter(""); } else setChapter(value);
    baseline.current = undefined; setDraft(undefined); setSettings(undefined); setDirty(false); setError(""); setMessage("");
  }
  async function saveSettings() {
    if (!settings || writing.current || pendingUpload.current || !selected) return;
    const duration = Number(settings.duration), passing = Number(settings.passing);
    if (!settings.duration.trim() || !settings.passing.trim() || !Number.isSafeInteger(duration) || duration < 1 || !Number.isSafeInteger(passing) || passing < 0 || passing > 100) { setError("Isi durasi positif dalam menit dan nilai minimal lulus 0–100."); return; }
    writing.current = true; setBusy(true); setError("");
    try {
      await apiRequest(`/api/admin/chapters/${selected.id}`, { method: "PATCH", body: JSON.stringify({ mini_checkpoint_duration_minutes: duration, mini_checkpoint_passing_score: passing }) });
      setSavedSettings(previous => ({ ...previous, [chapter]: settings })); setSettings(undefined); setMessage("Pengaturan chapter tersimpan.");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { writing.current = false; setBusy(false); setReadinessVersion(value => value + 1); }
  }
  async function persist(value: AdminAssessment, publish = false) {
    if (writing.current || pendingUpload.current || !selected) return;
    let next = { ...value, questions: value.questions.map(item => publish ? { ...item, status: "Published" as const } : item) };
    if (next.questions.some(item => item.image && !item.image_alt?.trim())) { setError("Isi teks alternatif setiap gambar soal."); return; }
    if (next.questions.some(item => !placementText(item.prompt).trim() || item.answers.length !== 4 || item.answers.some(answer => !placementText(answer).trim()) || !Number.isInteger(item.correctAnswer) || item.correctAnswer < 0 || item.correctAnswer > 3 || !/^\d+$/.test(item.order) || Number(item.order) > 2147483647 || (item.passageId && !next.passages?.some(p => p.id === item.passageId)))) { setError("Lengkapi pertanyaan, pilihan A–D, kunci jawaban, urutan valid, dan grup bacaan."); return; }
    if (next.passages?.some(p => !p.title.trim() || p.title.length > 255 || !placementText(p.body).trim())) { setError("Isi judul (maksimal 255 karakter) dan teks setiap grup bacaan."); return; }
    if (next.questions.some(item => item.status === "Published") && (!configured || settings)) { setError("Simpan durasi dan nilai minimal lulus chapter sebelum publish."); return; }
    writing.current = true; setBusy(true); setError(""); setMessage("");
    let confirmed = baseline.current ?? current;
    const checkpoint = () => { baseline.current = confirmed; setDraft(next); };
    const body = (item: AdminAssessment["questions"][number], owner: AdminAssessment) => {
      const passage = owner.passages?.find(p => p.id === item.passageId);
      return { chapter_id: selected.id, category: item.miniCategory ?? null, instruction: item.instruction || null, image_url: item.image || null, image_alt: item.image ? item.image_alt || null : null, image_position: item.image ? item.image_position ?? "before" : null, audio_url: item.audioUrl || null, passage: passage ? { id: passage.id, title: passage.title, body: passage.body } : null, question: item.prompt, options: Object.fromEntries(item.answers.map((answer, index) => [letters[index], answer])), correct_option: letters[item.correctAnswer], explanation: item.explanation || null, sort_order: Number(item.order), status: item.status.toLowerCase() };
    };
    try {
      // Published shared passages cannot change one member at a time. Stage chapter drafts first.
      const desiredStatuses = new Map(next.questions.map(item => [item.id, item.status]));
      for (const question of confirmed.questions.filter(item => item.status === "Published")) {
        await apiRequest(`${endpoint}/${question.id}`, { method: "PATCH", body: JSON.stringify({ status: "draft" }) });
        confirmed = { ...confirmed, questions: confirmed.questions.map(item => item.id === question.id ? { ...item, status: "Draft" } : item) }; checkpoint();
      }
      const targets = new Set(next.questions.filter(item => desiredStatuses.get(item.id) === "Published").map(item => item.id));
      const staged = { ...next, questions: next.questions.map(item => ({ ...item, status: "Draft" as const })) };
      // Checkpoint confirmed IDs and inline passage payloads; partial retries never create duplicate questions.
      for (const question of staged.questions) {
        const previous = confirmed.questions.find(item => item.id === question.id);
        if (previous && JSON.stringify(body(previous, confirmed)) === JSON.stringify(body(question, next))) continue;
        const exists = /^\d+$/.test(question.id);
        const result = (await apiRequest<{ data: Question }>(`${endpoint}${exists ? `/${question.id}` : ""}`, { method: exists ? "PATCH" : "POST", body: JSON.stringify(body(question, next)) })).data;
        const replacement = { ...question, id: String(result.id) };
        if (targets.delete(question.id)) targets.add(replacement.id);
        next = { ...next, questions: next.questions.map(item => item.id === question.id ? { ...replacement, status: targets.has(replacement.id) ? "Published" : "Draft" } : item) };
        confirmed = { ...confirmed, questions: [...confirmed.questions.filter(item => item.id !== question.id), replacement] };
        checkpoint();
      }
      for (const question of confirmed.questions.filter(item => !next.questions.some(kept => kept.id === item.id))) {
        await apiRequest(`${endpoint}/${question.id}`, { method: "DELETE" });
        confirmed = { ...confirmed, questions: confirmed.questions.filter(item => item.id !== question.id) }; checkpoint();
      }
      for (const question of next.questions.filter(item => targets.has(item.id))) {
        await apiRequest(`${endpoint}/${question.id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) });
        confirmed = { ...confirmed, questions: confirmed.questions.map(item => item.id === question.id ? { ...item, status: "Published" } : item) }; checkpoint();
      }
      baseline.current = next; setDraft(next); setDirty(false); setMessage(publish ? "Mini Checkpoint dipublikasikan." : "Mini Checkpoint tersimpan."); request.retry();
    } catch (cause) { checkpoint(); setDirty(true); setError(`Penyimpanan belum selesai. Perubahan berhasil tetap tersimpan; isian lain tetap di editor. Coba simpan lagi. ${errorMessage(cause)}`); }
    finally { writing.current = false; setBusy(false); setReadinessVersion(value => value + 1); }
  }
  const published = current.questions.filter(item => item.status === "Published").length;
  const content = <main className="admin-page curriculum-admin-page admin-learning-question-prototype">{navigation}{!nested && <AdminJourneyHeader tab="Mini Checkpoint" />}<div inert={busy || uploading}><AdminJourneyToolbar singleChapter programs={request.data?.programs ?? []} chapters={request.data?.chapters ?? []} program={program} chapter={chapter} onProgram={value => switchFilter(value, true)} onChapter={value => switchFilter(value)}>{selected && <button type="button" className="button" onClick={() => setSettings(config)}>Pengaturan Mini Checkpoint</button>}</AdminJourneyToolbar></div>{request.error && <p role="alert">{request.error}<button type="button" onClick={request.retry}>Coba Lagi</button></p>}{request.loading && !request.data && <p role="status">Memuat Mini Checkpoint...</p>}{selected && <><p role="status">{selected.title} · {current.questions.length} soal · {published} Terbit · Nilai maksimal 100 · Durasi {config.duration || "belum diatur"} menit · Lulus ≥ {config.passing || (config.passing === "0" ? "0" : "belum diatur")}% · {dirty || settings ? "Perubahan belum disimpan." : readiness === undefined ? "Memeriksa kesiapan server…" : readiness.length ? `Belum siap: ${readiness.join(" ")}` : "Siap menurut server."}</p><p>Saat menyimpan, soal Published dijadikan Draft sementara, lalu dipublikasikan kembali setelah semua perubahan tersimpan. Jika gagal, ulangi Simpan; soal dapat tetap Draft sampai proses selesai. Kategori opsional untuk komposisi soal, bukan sesi dengan timer terpisah. Satu durasi berlaku untuk seluruh chapter. Soal lama tanpa kategori tampil di Kosakata & Kanji.</p>{settings && <form className={styles.form} onSubmit={event => { event.preventDefault(); void saveSettings(); }}><fieldset disabled={busy || uploading} className={styles.fields}><legend>Pengaturan chapter</legend><label className="admin-field">Durasi (menit)<input required type="number" min="1" step="1" value={settings.duration} onChange={event => setSettings({ ...settings, duration: event.target.value })} /></label><label className="admin-field">Nilai minimal lulus (%)<input required type="number" min="0" max="100" step="1" value={settings.passing} onChange={event => setSettings({ ...settings, passing: event.target.value })} /></label><button type="submit" className="button button-primary">Simpan Pengaturan</button><button type="button" className="button" onClick={() => setSettings(undefined)}>Batal</button></fieldset></form>}<AdminTryoutQuestionBuilder key={chapter} studioTitle="Mini Checkpoint" saveLabel="Simpan Mini Checkpoint" draft={withContext} initialQuestion={null} onDirtyChange={ignoreDirtyChange} onUploadBusyChange={value => { pendingUpload.current = value; setUploading(value); }} busy={busy} error={error} onChange={change} onSave={persist} onClose={() => switchFilter("")} onDelete={async () => {}} saveStatus={dirty ? "Perubahan belum disimpan" : message || "Tidak ada perubahan"} bulkAction={<><button type="button" className="button" disabled={busy || uploading} onClick={() => setPreview(true)}>Pratinjau Seluruh Ujian</button><button type="button" className="button" disabled={busy || uploading || !current.questions.length} onClick={() => void persist(withContext, true)}>Simpan & Terbitkan Mini Checkpoint</button></>} /><AdminDialog open={preview} title="Pratinjau Mini Checkpoint" close={() => setPreview(false)}>{preview && <AdminAssessmentPreview assessment={withContext} />}</AdminDialog></>}{!selected && error && <p role="alert">{error}</p>}</main>;
  return nested ? content : <AdminShell current="/admin/mini-checkpoint">{content}</AdminShell>;
}
function ignoreDirtyChange() {}
