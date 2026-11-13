"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AdminDataTable, AdminDialog, AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { AdminJourneyHeader, AdminJourneyToolbar } from "@/components/admin-journey-toolbar";
import { useLearningRequest } from "@/components/learning-hooks";
import { adminLearningContext } from "@/lib/admin-learning-api";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { AdminCheckpointWorkspace } from "@/components/admin-checkpoint-workspace";
import { PlacementEditorProvider, PlacementEditorToolbar, PlacementRichText, PlacementTextEditor } from "@/components/placement-rich-text";
import { placementText } from "@/lib/placement-rich-text";
import styles from "./admin-placement-builder.module.css";
import editorStyles from "./admin-tryout-builder.module.css";
import { adminMediaUrl, rememberAdminMedia } from "@/lib/admin-media";
import { FiBookOpen } from "react-icons/fi";
import { AdminAudioWorkspace } from "@/components/admin-audio-workspace";
import { AdminReadingWorkspace } from "@/components/admin-reading-workspace";

type Kind = "Audio" | "Reading" | "Mini Checkpoint" | "Checkpoint";
type Question = { id: number; chapter_id?: number; reading_passage_id?: number; question: string; title?: string; audio_url?: string; options: Record<string, string>; correct_option: string; explanation: string | null; sort_order: number; status: "draft" | "published" };
type Passage = { id: number; chapter_id: number; title: string; body: string; status: string };
const resources: Record<Kind, string> = { Checkpoint: "checkpoint-questions", Audio: "audio-questions", Reading: "reading-questions", "Mini Checkpoint": "mini-checkpoint-questions" };

function QuestionWorkspaceFrame({ nested, route, className, children }: { nested: boolean; route: string; className: string; children: ReactNode }) {
  return nested ? <>{children}</> : <AdminShell current={route}><main className={className}>{children}</main></AdminShell>;
}

export function AdminQuestionWorkspace(props: { kind: Kind; navigation?: ReactNode; nested?: boolean }) {
  return props.kind === "Checkpoint" ? <AdminCheckpointWorkspace /> : props.kind === "Reading" ? <AdminReadingWorkspace navigation={props.navigation} nested={props.nested} /> : props.kind === "Audio" ? <AdminAudioWorkspace navigation={props.navigation} nested={props.nested} /> : <ChapterQuestionWorkspace {...props} />;
}

function ChapterQuestionWorkspace({ kind, navigation, nested = false }: { kind: Kind; navigation?: ReactNode; nested?: boolean }) {
  const journey = kind === "Reading" || kind === "Audio" || kind === "Mini Checkpoint" || kind === "Checkpoint";
  const journeyTab = kind === "Reading" ? "Reading Question" : kind === "Audio" ? "Audio Question" : kind === "Mini Checkpoint" ? "Mini Checkpoint" : undefined;
  const pageClass = journeyTab ? "admin-page curriculum-admin-page admin-learning-question-prototype" : "admin-public-prototype admin-learning-question-prototype";
  const resource = resources[kind];
  const load = useCallback(async (signal: AbortSignal) => {
    const [context, questions, passages] = await Promise.all([adminLearningContext(signal), apiRequest<{ data: Question[] }>(`/api/admin/${resource}`, { signal }), kind === "Checkpoint" ? Promise.resolve({ data: [] as Passage[] }) : apiRequest<{ data: Passage[] }>("/api/admin/reading-passages", { signal })]);
    questions.data.forEach(item => rememberAdminMedia(item));
    return { ...context, questions: questions.data, passages: passages.data };
  }, [resource, kind]);
  const request = useLearningRequest(load, `admin-${resource}`);
  const [draft, setDraft] = useState<Partial<Question>>();
  const [preview, setPreview] = useState<Question>();
  const [previewAnswer, setPreviewAnswer] = useState("");
  const [programId, setProgramId] = useState<number>();
  const [passage, setPassage] = useState<Partial<Passage>>();
  const [groupForm, setGroupForm] = useState(false);
  const [groupChapterId, setGroupChapterId] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupBody, setGroupBody] = useState("");
  const [groupCount, setGroupCount] = useState("1");
  const [groupError, setGroupError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [filterProgram, setFilterProgram] = useState("");
  const [filterChapter, setFilterChapter] = useState("");
  const [settingsChapterId, setSettingsChapterId] = useState<number>();
  const [duration, setDuration] = useState("");
  const [passingScore, setPassingScore] = useState("");
  const [settingsError, setSettingsError] = useState<string>();
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [savedSettings, setSavedSettings] = useState<Record<number, { duration: number; passingScore: number }>>({});
  const selectedChapter = request.data?.chapters.find(chapter => String(chapter.id) === filterChapter);
  const savedDuration = selectedChapter ? savedSettings[selectedChapter.id]?.duration ?? selectedChapter.mini_checkpoint_duration_minutes : undefined;
  const savedPassingScore = selectedChapter ? savedSettings[selectedChapter.id]?.passingScore ?? selectedChapter.mini_checkpoint_passing_score : undefined;
  async function saveSettings() {
    if (settingsBusy || !settingsChapterId) return;
    const minutes = Number(duration);
    const score = Number(passingScore);
    if (!duration.trim() || !passingScore.trim() || !Number.isSafeInteger(minutes) || minutes < 1 || !Number.isSafeInteger(score) || score < 0 || score > 100) {
      setSettingsError("Isi durasi positif dalam menit dan nilai minimal lulus 0–100.");
      return;
    }
    setSettingsBusy(true);
    setSettingsError(undefined);
    try {
      await apiRequest(`/api/admin/chapters/${settingsChapterId}`, { method: "PATCH", body: JSON.stringify({ mini_checkpoint_duration_minutes: minutes, mini_checkpoint_passing_score: score }) });
      setSavedSettings(current => ({ ...current, [settingsChapterId]: { duration: minutes, passingScore: score } }));
      setSettingsChapterId(undefined);
    } catch (cause) {
      setSettingsError(cause instanceof ApiError && Object.keys(cause.errors).length ? Object.values(cause.errors).flat().join(" ") : cause instanceof Error ? cause.message : "Pengaturan belum tersimpan. Silakan coba lagi.");
    } finally { setSettingsBusy(false); }
  }
  const route = kind === "Checkpoint" ? "/admin/checkpoint" : kind === "Audio" ? "/admin/audio-question" : kind === "Reading" ? "/admin/reading-question" : "/admin/mini-checkpoint";
  const close = useCallback(() => { if (!busy) { setDraft(undefined); setPassage(undefined); } }, [busy]);
  async function save(value: Partial<Question> | Partial<Passage>, endpoint: string) {
    if (busy) return;
    if ("question" in value && (!placementText(value.question ?? "").trim() || ["A", "B", "C", "D"].some(key => !placementText(value.options?.[key] ?? "").trim()))) { setError("Isi pertanyaan dan pilihan A?D."); return; }
    if ("body" in value && !placementText(value.body ?? "").trim()) { setError("Teks bacaan wajib diisi."); return; }
    setBusy(true); setError(undefined);
    try {
      await apiRequest(`/api/admin/${endpoint}${value.id ? `/${value.id}` : ""}`, { method: value.id ? "PATCH" : "POST", body: JSON.stringify(endpoint === "mini-checkpoint-questions" && "question" in value ? { chapter_id: value.chapter_id, question: value.question, options: value.options, correct_option: value.correct_option, explanation: value.explanation, sort_order: value.sort_order, status: value.status } : value) });
      setDraft(undefined); setPassage(undefined); request.retry();
    } catch (cause) { setError(cause instanceof ApiError && Object.keys(cause.errors).length ? Object.values(cause.errors).flat().join(" ") : cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi."); }
    finally { setBusy(false); }
  }
  const chapters = useMemo(() => request.data?.chapters.filter(chapter => (kind === "Mini Checkpoint" || kind === "Checkpoint") || request.data?.programs.find(program => program.id === chapter.program_id)?.family === "jlpt") ?? [], [request.data?.chapters, request.data?.programs, kind]);
  const openGroupDialog = useCallback(() => {
    setError(undefined);
    setGroupError(undefined);
    setGroupTitle("");
    setGroupBody("");
    setGroupCount("1");
    const currentPassage = request.data?.passages.find(p => p.id === draft?.reading_passage_id);
    const defaultChapter = currentPassage ? String(currentPassage.chapter_id) : (filterChapter || (chapters[0]?.id ? String(chapters[0].id) : ""));
    setGroupChapterId(defaultChapter);
    setGroupForm(true);
  }, [draft, filterChapter, chapters, request.data?.passages]);
  async function addGroup() {
    const count = Number(groupCount);
    if (!groupChapterId || !groupTitle.trim() || !placementText(groupBody).trim() || !Number.isSafeInteger(count) || count < 1) {
      setGroupError("Isi chapter, judul, bacaan, dan jumlah soal positif.");
      return;
    }
    setBusy(true);
    setGroupError(undefined);
    try {
      const passageRes = await apiRequest<{ data: Passage }>("/api/admin/reading-passages", {
        method: "POST",
        body: JSON.stringify({ chapter_id: Number(groupChapterId), title: groupTitle.trim(), body: groupBody, status: "draft" }),
      });
      const newPassage = passageRes.data;
      const existingOrders = request.data?.questions.map(q => q.sort_order) ?? [];
      const baseOrder = existingOrders.length ? Math.max(...existingOrders) : 0;
      const createdQuestions: Question[] = [];
      for (let i = 0; i < count; i++) {
        const qRes = await apiRequest<{ data: Question }>("/api/admin/reading-questions", {
          method: "POST",
          body: JSON.stringify({
            reading_passage_id: newPassage.id,
            question: `Pertanyaan ${i + 1}`,
            options: { A: "Pilihan A", B: "Pilihan B", C: "Pilihan C", D: "Pilihan D" },
            correct_option: "A",
            explanation: "",
            sort_order: baseOrder + i + 1,
            status: "draft",
          }),
        });
        createdQuestions.push(qRes.data);
      }
      await request.retry();
      setGroupForm(false);
      setGroupTitle("");
      setGroupBody("");
      setGroupCount("1");
      if (createdQuestions[0]) setDraft(createdQuestions[0]);
    } catch (cause) {
      setGroupError(cause instanceof ApiError && Object.keys(cause.errors).length ? Object.values(cause.errors).flat().join(" ") : cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  if (request.error && !request.data) return <QuestionWorkspaceFrame nested={nested} route={route} className={pageClass}>{navigation}{!nested && (journeyTab ? <AdminJourneyHeader tab={journeyTab} /> : <AdminPageHeader title={kind} />)}<p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></QuestionWorkspaceFrame>;
  const visible = journey ? request.data?.questions.filter(row => {
    const chapterId = kind === "Reading" ? request.data?.passages.find(item => item.id === row.reading_passage_id)?.chapter_id : row.chapter_id;
    return (!filterChapter || String(chapterId) === filterChapter) && (!filterProgram || chapters.some(item => item.id === chapterId && String(item.program_id) === filterProgram));
  }) ?? [] : request.data?.questions ?? [];
  const assessmentAdd = <button type="button" className="button button-primary" disabled={!request.data} onClick={() => { setError(undefined); setProgramId(filterProgram ? Number(filterProgram) : undefined); setDraft({ chapter_id: filterChapter ? Number(filterChapter) : undefined, question: "", options: { A: "", B: "", C: "", D: "" }, correct_option: "A", explanation: "", status: "draft", sort_order: 0 }); }}>Tambah Soal</button>;
  return <QuestionWorkspaceFrame nested={nested} route={route} className={pageClass}>{navigation}{!nested && (journeyTab ? <AdminJourneyHeader tab={journeyTab} actions={kind === "Reading" || kind === "Audio" ? undefined : assessmentAdd} /> : <AdminPageHeader title={kind} actions={assessmentAdd} />)}{journey && <AdminJourneyToolbar programs={request.data?.programs ?? []} chapters={chapters} program={filterProgram} chapter={filterChapter} onProgram={value => { setFilterProgram(value); setFilterChapter(""); }} onChapter={setFilterChapter}>{kind === "Mini Checkpoint" && <button type="button" className="button" disabled={!selectedChapter || settingsBusy} onClick={() => { if (!selectedChapter) return; setDuration(savedDuration == null ? "" : String(savedDuration)); setPassingScore(savedPassingScore == null ? "" : String(savedPassingScore)); setSettingsError(undefined); setSettingsChapterId(selectedChapter.id); }}>Pengaturan Mini Checkpoint</button>}{kind === "Reading" && <button type="button" className="button" onClick={() => setPassage({ title: "", body: "", status: "draft", chapter_id: filterChapter ? Number(filterChapter) : undefined })}>Teks bacaan</button>}{kind === "Reading" && <button type="button" className="button" onClick={openGroupDialog}><FiBookOpen aria-hidden="true" />Tambah Grup Bacaan</button>}<button type="button" className="button button-primary" disabled={!request.data || busy} onClick={() => { setError(undefined); setProgramId(filterProgram ? Number(filterProgram) : undefined); setDraft({ question: "", options: { A: "", B: "", C: "", D: "" }, correct_option: "A", explanation: "", status: "draft", sort_order: 0, ...(kind === "Reading" ? { reading_passage_id: request.data?.passages.find(item => String(item.chapter_id) === filterChapter)?.id } : { chapter_id: filterChapter ? Number(filterChapter) : undefined }) }); }}>+ Tambah Soal</button></AdminJourneyToolbar>}{kind === "Mini Checkpoint" && selectedChapter && <p role="status">{selectedChapter.title} — Durasi total: {savedDuration == null ? "Belum diatur" : `${savedDuration} menit`}. Nilai minimal lulus: {savedPassingScore == null ? "Belum diatur" : `${savedPassingScore}%`}.</p>}{request.error && <p role="alert">{request.error}</p>}{error && <p role="alert">{error}</p>}<AdminDataTable loading={request.loading && !request.data} caption={kind} rows={visible} empty={journey ? "Belum ada soal untuk filter ini." : undefined} rowKey={row => String(row.id)} columns={[{ key: "prompt", header: "Pertanyaan", cell: row => <PlacementRichText value={row.question} /> }, { key: "status", header: "Status", cell: row => <AdminStatusBadge status={row.status === "published" ? "Published" : "Draft"} /> }, { key: "order", header: "Urutan", cell: row => row.sort_order }]} actions={{ cell: row => <div className="admin-page-actions"><button type="button" className="button" onClick={() => { setPreviewAnswer(""); setPreview(row); }}>Preview</button><button type="button" className="button" onClick={() => { setError(undefined); setProgramId(undefined); setDraft(row); }}>Edit</button><button type="button" className="button" disabled={busy} onClick={async () => { if (!window.confirm("Hapus pertanyaan?")) return; setBusy(true); try { await apiRequest(`/api/admin/${resource}/${row.id}`, { method: "DELETE" }); request.retry(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi."); } finally { setBusy(false); } }}>Hapus</button></div> }} />{kind === "Reading" && <AdminDataTable caption="Teks bacaan" rows={request.data?.passages ?? []} rowKey={row => String(row.id)} columns={[{ key: "title", header: "Judul", cell: row => row.title }]} actions={{ cell: row => <button type="button" className="button" onClick={() => setPassage(row)}>Edit</button> }} />}
  <AdminDialog open={settingsChapterId !== undefined} title="Pengaturan Mini Checkpoint" close={() => { if (!settingsBusy) setSettingsChapterId(undefined); }}>
    <form className={`admin-prototype-form ${styles.form}`} onSubmit={event => { event.preventDefault(); void saveSettings(); }} aria-busy={settingsBusy}>
      <p>{chapters.find(chapter => chapter.id === settingsChapterId)?.title}</p>
      <fieldset disabled={settingsBusy} className={styles.fields}>
        <label className="admin-field">Durasi (menit)<input required type="number" min="1" step="1" value={duration} onChange={event => setDuration(event.target.value)} /></label>
        <label className="admin-field">Nilai minimal lulus (%)<input required type="number" min="0" max="100" step="1" value={passingScore} onChange={event => setPassingScore(event.target.value)} /></label>
      </fieldset>
      {settingsError && <p role="alert">{settingsError}</p>}
      <div className={styles.actions}><button type="button" className="button button-secondary" disabled={settingsBusy} onClick={() => setSettingsChapterId(undefined)}>Batal</button><button type="submit" className="button button-primary" disabled={settingsBusy}>{settingsBusy ? "Menyimpan..." : "Simpan"}</button></div>
    </form>
  </AdminDialog>
  <AdminDialog open={Boolean((draft || passage) && !groupForm)} title={passage ? "Teks bacaan" : draft?.id ? "Edit Soal" : "Tambah Soal"} close={close}>{draft && <form className={`admin-prototype-form ${styles.form} ${styles.questionForm} ${editorStyles.form}`} onSubmit={event => { event.preventDefault(); void save(draft, resource); }}><fieldset disabled={busy} className={styles.fields}>{kind === "Reading" ? <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap", width: "100%" }}><label className="admin-field" style={{ flex: "1 1 240px", minWidth: 0 }}>Teks bacaan<select required value={draft.reading_passage_id ?? ""} onChange={event => setDraft({ ...draft, reading_passage_id: Number(event.target.value) })}><option value="">Pilih</option>{request.data?.passages.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="button" className="button" style={{ minHeight: "44px" }} onClick={openGroupDialog}><FiBookOpen aria-hidden="true" />Tambah Grup Bacaan</button></div> : <div className={styles.questionMeta}><label className="admin-field">Program<select value={programId ?? request.data?.chapters.find(item => item.id === draft.chapter_id)?.program_id ?? ""} onChange={event => { setProgramId(Number(event.target.value)); setDraft({ ...draft, chapter_id: undefined }); }}><option value="">Pilih program</option>{request.data?.programs.filter(item => chapters.some(chapter => chapter.program_id === item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="admin-field">Chapter<select required value={draft.chapter_id ?? ""} onChange={event => setDraft({ ...draft, chapter_id: Number(event.target.value) })}><option value="">Pilih</option>{chapters.filter(item => item.program_id === (programId ?? request.data?.chapters.find(chapter => chapter.id === draft.chapter_id)?.program_id)).map(item => <option key={item.id} value={item.id}>{request.data?.programs.find(program => program.id === item.program_id)?.name} • {item.title}</option>)}</select></label></div>}{kind === "Audio" && <div className={styles.media}><label className="admin-field">Judul<input placeholder="Contoh: Percakapan di Stasiun" value={draft.title ?? ""} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><label className="admin-field">URL audio<input placeholder="Contoh: https://example.com/audio/percakapan.mp3 atau media/audio/percakapan.mp3" value={draft.audio_url ?? ""} onChange={event => setDraft({ ...draft, audio_url: event.target.value })} /></label><AdminMediaUpload kind="audio" onUploaded={audio_url => setDraft({ ...draft, audio_url })} />{draft.audio_url && <audio src={adminMediaUrl(draft.audio_url)} controls preload="metadata" />}</div>}<div className="admin-field"><span>Pertanyaan</span><PlacementTextEditor label="Pertanyaan" value={draft.question ?? ""} onChange={question => setDraft({ ...draft, question })} /></div><div className={styles.grid}>{["A", "B", "C", "D"].map(option => <div key={option} className="admin-field"><span>Pilihan {option}</span><PlacementTextEditor label={`Pilihan ${option}`} value={draft.options?.[option] ?? ""} onChange={value => setDraft({ ...draft, options: { ...draft.options, [option]: value } })} /></div>)}</div><label className="admin-field">Jawaban benar<select value={draft.correct_option} onChange={event => setDraft({ ...draft, correct_option: event.target.value })}>{["A", "B", "C", "D"].map(option => <option key={option}>{option}</option>)}</select></label><div className="admin-field"><span>Penjelasan jawaban (opsional)</span><PlacementTextEditor label="Penjelasan jawaban" value={draft.explanation ?? ""} onChange={explanation => setDraft({ ...draft, explanation })} /></div><label className="admin-field">Urutan<input required placeholder="Contoh: 1" type="number" min="0" step="1" value={draft.sort_order ?? ""} onChange={event => setDraft({ ...draft, sort_order: event.target.valueAsNumber })} /></label><label className="admin-field">Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Question["status"] })}><option value="draft">{kind === "Mini Checkpoint" ? "Draf (belum ditampilkan)" : "Draft"}</option><option value="published">{kind === "Mini Checkpoint" ? "Diterbitkan (tampil ke siswa)" : "Published"}</option></select></label></fieldset>{error && <p role="alert">{error}</p>}<div className={styles.actions}><button type="button" className="button button-secondary" disabled={busy} onClick={close}>Batal</button><button type="submit" className="button button-primary" disabled={busy}>Simpan</button></div></form>}{passage && <form className={`admin-prototype-form ${styles.form} ${styles.questionForm} ${editorStyles.form}`} onSubmit={event => { event.preventDefault(); void save(passage, "reading-passages"); }}><fieldset disabled={busy} className={styles.fields}><label className="admin-field">Chapter<select required value={passage.chapter_id ?? ""} onChange={event => setPassage({ ...passage, chapter_id: Number(event.target.value) })}><option value="">Pilih</option>{chapters.map(item => <option key={item.id} value={item.id}>{request.data?.programs.find(program => program.id === item.program_id)?.name} • {item.title}</option>)}</select></label><label className="admin-field">Judul<input required placeholder="Contoh: Kegiatan Sehari-hari di Sekolah" value={passage.title ?? ""} onChange={event => setPassage({ ...passage, title: event.target.value })} /></label><div className="admin-field"><span>Teks bacaan</span><PlacementTextEditor label="Teks bacaan" value={passage.body ?? ""} onChange={body => setPassage({ ...passage, body })} /></div><label className="admin-field">Status<select value={passage.status} onChange={event => setPassage({ ...passage, status: event.target.value })}><option value="draft">{kind === "Mini Checkpoint" ? "Draf (belum ditampilkan)" : "Draft"}</option><option value="published">{kind === "Mini Checkpoint" ? "Diterbitkan (tampil ke siswa)" : "Published"}</option></select></label></fieldset>{error && <p role="alert">{error}</p>}<div className={styles.actions}><button type="button" className="button button-secondary" disabled={busy} onClick={close}>Batal</button><button type="submit" className="button button-primary" disabled={busy}>Simpan</button></div></form>}</AdminDialog><AdminDialog open={groupForm} title="Grup Bacaan Reading" className={editorStyles.packageDialog} close={() => { if (!busy) setGroupForm(false); }} actions={<><button className="button" type="button" disabled={busy} onClick={() => setGroupForm(false)}>Kembali</button><button className="button button-primary" type="submit" form="tryout-reading-group" disabled={busy}>{busy ? "Menyimpan..." : "Buat Grup"}</button></>}><form id="tryout-reading-group" className={editorStyles.groupForm} onSubmit={event => { event.preventDefault(); void addGroup(); }}><p className={editorStyles.linkedHint}>Satu bacaan bersama untuk beberapa soal Reading.</p><label className="admin-field">Chapter<select required value={groupChapterId} onChange={event => setGroupChapterId(event.target.value)}><option value="">Pilih</option>{chapters.map(item => <option key={item.id} value={item.id}>{request.data?.programs.find(program => program.id === item.program_id)?.name} • {item.title}</option>)}</select></label><label className="admin-field">Judul internal bacaan<input required value={groupTitle} placeholder="Contoh: Bacaan A" onChange={event => setGroupTitle(event.target.value)} /></label><PlacementEditorProvider><div className={editorStyles.groupText}><div className={editorStyles.sharedToolbar}><PlacementEditorToolbar disabled={busy} /></div><PlacementTextEditor shared disabled={busy} label="Teks bacaan grup" value={groupBody} onChange={setGroupBody} /></div></PlacementEditorProvider><label className={`admin-field ${editorStyles.groupCount}`}>Jumlah soal awal<input aria-label="Jumlah soal awal" required type="number" min="1" step="1" value={groupCount} onChange={event => setGroupCount(event.target.value)} /><small className={editorStyles.linkedHint}>Soal baru otomatis terhubung ke bacaan ini.</small></label>{groupError && <p role="alert">{groupError}</p>}</form></AdminDialog><AdminDialog open={Boolean(preview)} title="Preview Soal" close={() => setPreview(undefined)}>{preview && (kind === "Audio" ? <section className="learning-question-card">
    <p className="dash-kicker">SOAL 1 DARI 1</p>
    {preview.audio_url && <audio controls preload="metadata" src={adminMediaUrl(preview.audio_url)} aria-label={preview.title ?? "Audio"} />}
    <h2><PlacementRichText value={preview.question} /></h2>
    <fieldset><legend className="sr-only">Pilihan jawaban</legend>{Object.entries(preview.options).map(([key, value]) => <label key={key} className={previewAnswer === key ? "selected" : ""}><input type="radio" name={`preview-audio-${preview.id}`} checked={previewAnswer === key} onChange={() => setPreviewAnswer(key)} /><span>{key}. <PlacementRichText value={value} /></span></label>)}</fieldset>
  </section> : <section className={styles.form}>{preview.reading_passage_id && <p><PlacementRichText value={request.data?.passages.find(item => item.id === preview.reading_passage_id)?.body ?? ""} /></p>}{preview.audio_url && <audio controls src={adminMediaUrl(preview.audio_url)} />}<h3><PlacementRichText value={preview.question} /></h3>{Object.entries(preview.options).map(([key, value]) => <p key={key}>{key}. <PlacementRichText value={value} /></p>)}<p>Jawaban benar: {preview.correct_option}</p><p><PlacementRichText value={preview.explanation ?? ""} /></p></section>)}</AdminDialog></QuestionWorkspaceFrame>;
}
