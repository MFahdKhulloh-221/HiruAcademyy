"use client";

import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useContent } from "@/lib/public-content-api";
import { useLearningRequest } from "@/components/learning-hooks";
import { loadAdminTryOuts, saveAdminTryOut, deleteAdminTryOut, setAdminTryOutStatus, publishAdminTryOutQuestions, adminTryOutError } from "@/lib/admin-tryout-api";
import { AdminTryoutQuestionBuilder } from "@/components/admin-tryout-question-builder";
import { AdminDataTable, AdminDialog, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge, AdminTabs } from "@/components/admin-primitives";
import { AdminAssessmentPreview } from "@/components/admin-assessment-preview";
import tryoutStyles from "./admin-tryout-builder.module.css";
import { AdminQuestionWorkspace } from "@/components/admin-question-workspace";
import { assessmentSessions } from "@/lib/assessment-attempt";
import { assessmentError, assessmentSections, copyAssessment, miniAssessmentContexts, tryoutAssessmentContexts, type AdminAssessment, type AdminAssessmentKind, type AdminAssessmentQuestion } from "@/components/admin-assessment-fixtures";

function AssessmentWorkspace({ kind, navigation }: { kind: AdminAssessmentKind; navigation?: ReactNode }) {
  const mini = kind === "mini";
  const title = mini ? "Mini Checkpoint" : "Try Out";
  const catalog = useContent<{ id: number; code: string; name: string; family: string; status: string }>("/api/admin/programs");
  const programs = catalog.data.filter(program => program.status === "active" && program.family === "jlpt" && tryoutAssessmentContexts.some(code => code === program.code.toUpperCase()));
  const contexts: readonly string[] = mini ? miniAssessmentContexts : programs.map(program => program.code.toUpperCase());
  const programName = (code: string) => programs.find(program => program.code.toUpperCase() === code)?.name ?? code;
  const [tab, setTab] = useState("Daftar Try Out");
  const [confirmClose, setConfirmClose] = useState(false);
  const [questionDirty, setQuestionDirty] = useState(false);
  const [packageForm, setPackageForm] = useState(true);
  const targetSelect = useRef<HTMLSelectElement>(null);
  const load = useCallback((signal: AbortSignal) => mini ? Promise.resolve([]) : loadAdminTryOuts(signal), [mini]);
  const request = useLearningRequest(load, `admin-${kind}`);
  const [savedRows, setRows] = useState<AdminAssessment[] | null>(null);
  const rows = savedRows ?? request.data ?? [];
  const [draft, setDraft] = useState<AdminAssessment | null>(null);
  const [questionDraft, setQuestionDraft] = useState<AdminAssessmentQuestion | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; question: boolean; label: string } | null>(null);
  const [search, setSearch] = useState("");
  const [context, setContext] = useState("");
  const [questionTarget, setQuestionTarget] = useState("");
  const [chapter, setChapter] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<{ action: "save" | "status" | "questions" | "delete"; id: string } | null>(null);
  const busy = pending !== null;
  const busyRef = useRef(false);
  function beginWrite(action: NonNullable<typeof pending>["action"], id: string) {
    if (busyRef.current) return false;
    busyRef.current = true; setPending({ action, id }); return true;
  }
  function endWrite() { busyRef.current = false; setPending(null); }
  const closeEditor = useCallback(() => { setDraft(null); setTab("Daftar Try Out"); setQuestionDirty(false); setQuestionDraft(null); setDeleting(null); setError(""); }, [setDraft, setQuestionDraft, setDeleting, setError]);
  const closeView = useCallback(() => setView(null), [setView]);
  const closeDelete = useCallback(() => setDeleting(null), [setDeleting]);
  const query = search.trim().toLowerCase();
  const visible = rows.filter((row) => (!context || row.context === context) && (!questionTarget || row.id === questionTarget) && (!chapter || row.chapter === chapter) && (!status || row.status === status) && [row.title, row.context, row.chapter, row.session, row.part, ...row.questions.map((question) => question?.prompt ?? "")].some((value) => (value ?? "").toLowerCase().includes(query))).sort((a, b) => Number(a.order) - Number(b.order) || a.id.localeCompare(b.id));
  const viewItem = rows.find((row) => row.id === view);
  function edit(item: AdminAssessment) {
    if (busyRef.current) return;
    setPackageForm(true); setDraft(copyAssessment(item)); setError(""); setQuestionDraft(null);
  }
  async function persist(next: AdminAssessment) {
    const issue = assessmentError(next);
    if (issue) { setError(issue); return; }
    if (!beginWrite("save", next.id)) return;
    try { setRows(await saveAdminTryOut(next, rows.find(row => row.id === next.id))); closeEditor(); setMessage("Try Out berhasil disimpan."); }
    catch (cause) { setError(adminTryOutError(cause)); }
    finally { endWrite(); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft) await persist(draft);
  }
  const packageDirty = Boolean(draft && JSON.stringify(draft) !== JSON.stringify(rows.find(row => row.id === draft.id)));
  function requestClose() {
    if (busyRef.current) return;
    if (packageDirty || questionDirty) { setConfirmClose(true); return; }
    closeEditor();
  }
  async function toggleAssessment(item: AdminAssessment) {
    const next = { ...item, status: item.status === "Draft" ? "Published" : "Draft" } as AdminAssessment;
    const issue = assessmentError(next);
    if (issue) { setMessage(issue); return; }
    if (draft || !beginWrite("status", item.id)) return;
    try {
      await setAdminTryOutStatus(item.id, next.status);
      setRows(current => (current ?? rows).map(row => row.id === item.id ? { ...row, status: next.status } : row));
      setMessage("Status diubah.");
    } catch (cause) { setMessage(adminTryOutError(cause)); }
    finally { endWrite(); }
  }
  async function publishQuestions(item: AdminAssessment) {
    if (draft || !/^\d+$/.test(item.id) || !beginWrite("questions", item.id)) return;
    setError(""); setMessage("");
    try {
      const result = await publishAdminTryOutQuestions(item.id);
      const persistedIds = new Set(item.questions.map(question => question.id));
      const published = (row: AdminAssessment): AdminAssessment => ({ ...row, questions: row.questions.map(question => persistedIds.has(question.id) ? { ...question, status: "Published" } : question) });
      setRows(current => (current ?? rows).map(row => row.id === item.id ? published(row) : row));
      setMessage(`${result.published_count} soal Published.`);
    } catch (cause) { const detail = adminTryOutError(cause); setError(detail); setMessage(detail); }
    finally { endWrite(); }
  }
  function manageQuestions(item: AdminAssessment, question?: AdminAssessmentQuestion) {
    edit(item); setPackageForm(false); setTab("Bank Soal"); setQuestionTarget(item.id);
    if (question) setQuestionDraft({ ...question, answers: [...question.answers] });
  }
  function openBank() {
    if (draft && !packageForm) { setTab("Bank Soal"); return; }
    const item = rows.find(row => row.id === questionTarget) ?? rows.find(row => !context || row.context === context);
    if (item) manageQuestions(item); else setTab("Bank Soal");
  }
  const questionBuilder = draft && !packageForm ? <AdminTryoutQuestionBuilder draft={draft} initialQuestion={questionDraft} onDirtyChange={setQuestionDirty} busy={busy} error={error} onChange={setDraft} onSave={persist} onClose={requestClose} onDelete={async question => { if (/^\d+$/.test(question.id)) { if (!beginWrite("delete", question.id)) return; try { setRows(await deleteAdminTryOut(draft.id, question)); } finally { endWrite(); } } setDraft({ ...draft, questions: draft.questions.filter(item => item.id !== question.id) }); }} /> : null;
  return <AdminShell current={mini ? "/admin/mini-checkpoint" : "/admin/try-out"}><main className={`admin-public-prototype admin-assessment-prototype ${tryoutStyles.workspace}`}>{navigation}
    <AdminPageHeader title={title} actions={<button className="button button-primary" type="button" onClick={() => edit({ id: crypto.randomUUID(), kind, title: "", context: context || contexts[0] || "", chapter: mini ? chapter : "", session: mini ? "1" : "", part: mini ? "1" : "", duration: "", maxScore: mini ? "100" : "180", passingScore: "", order: String(rows.reduce((max, row) => Math.max(max, Number(row.order)), 0) + 1), status: "Draft", questions: [] })}>+ Tambah {title}</button>} />
    {mini && <p role="status">OPEN: konfigurasi sesi, part, timer Mini belum tersedia di backend.</p>}{request.error && <p role="alert">{request.error}</p>}<p role="status">{message}</p>
    <AdminTabs tabs={["Daftar Try Out", "Bank Soal"]} active={tab} onChange={value => { if (value === "Bank Soal") openBank(); else if (draft && !packageForm && (packageDirty || questionDirty)) requestClose(); else { closeEditor(); setTab(value); } }} label="Tampilan Try Out" />
    {catalog.error && <p role="alert">{catalog.error} <button type="button" onClick={catalog.reload}>Coba Lagi</button></p>}
    <AdminSection><div className={tryoutStyles.toolbar}>
      <div className={tryoutStyles.filters}>
        <label className="admin-field">Program<select aria-label="Program" value={context} disabled={tab === "Bank Soal" && Boolean(draft)} onChange={event => { setContext(event.target.value); setChapter(""); setQuestionTarget(""); }}><option value="">Semua Program</option>{contexts.map(value => <option key={value} value={value}>{programName(value)}</option>)}</select></label>
        <label className="admin-field">Try Out tujuan<select aria-label="Try Out tujuan" ref={targetSelect} value={questionTarget} disabled={tab === "Bank Soal" && (packageDirty || questionDirty)} onChange={event => { setQuestionTarget(event.target.value); if (tab === "Bank Soal") { const item = rows.find(row => row.id === event.target.value); if (item) manageQuestions(item); else closeEditor(); } }}><option value="">Pilih Try Out</option>{rows.filter(row => !context || row.context === context).map(row => <option key={row.id} value={row.id}>{programName(row.context)} / {row.title}</option>)}</select></label>
        <label className="admin-field">Status<select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)}><option value="">Semua</option><option>Draft</option><option>Published</option></select></label>
        <label className="admin-field">Cari judul<input type="search" aria-label={`Cari ${title}`} placeholder="Cari judul..." value={search} onChange={event => setSearch(event.target.value)} /></label>
      </div>
    </div>{tab === "Bank Soal" ? <>{draft && !packageForm && <h2>{draft.title} / {programName(draft.context)}</h2>}{questionBuilder ?? <p>Pilih Try Out untuk mengelola soal.</p>}</> : <AdminDataTable loading={request.loading && !request.data && !savedRows} caption="Daftar Try Out" empty="Belum ada Try Out sesuai filter." rows={visible} rowKey={(row) => row.id} columns={[
      { key: "title", header: "Judul", cell: (row) => row.title },
      { key: "context", header: "Program", cell: (row) => `${programName(row.context)}${mini ? ` • ${row.chapter} • Sesi ${row.session} • Part ${row.part}` : ""}` },
      { key: "questions", header: "Jumlah Soal", cell: (row) => `${row.questions.length} soal • ${row.questions.filter(question => question.status === "Draft").length} Draft • ${row.questions.filter(question => question.status === "Published").length} Published` },
      { key: "access", header: "Akses", cell: (row) => <span className={tryoutStyles.accessBadge}>{row.accessType === "free" ? "Gratis" : "Membership"}</span> },
      { key: "duration", header: "Durasi", cell: (row) => row.duration ? `${row.duration} menit` : "Belum diatur" },
      { key: "passing", header: "Nilai Lulus", cell: (row) => row.passingScore || "Belum diatur" },
      { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.status} /> },
    ]} actions={{ cell: (row) => <div className={tryoutStyles.rowActions}><button className="button" type="button" onClick={() => { setQuestionTarget(row.id); manageQuestions(row); }}>Kelola Soal</button><button className="button" type="button" onClick={() => edit(row)}>Edit</button><details className={tryoutStyles.more}><summary>Tindakan lain</summary><div><button className="button" type="button" onClick={() => setView(row.id)}>Lihat</button><button className="button" type="button" disabled={busy || Boolean(draft)} aria-busy={pending?.action === "questions" && pending.id === row.id} onClick={() => publishQuestions(row)}>{pending?.action === "questions" && pending.id === row.id ? "Mempublikasikan Semua Soal…" : "Publish Semua Soal"}</button><button className="button" type="button" disabled={busy || Boolean(draft)} aria-busy={pending?.action === "status" && pending.id === row.id} onClick={() => toggleAssessment(row)}>{pending?.action === "status" && pending.id === row.id ? row.status === "Draft" ? "Mempublikasikan…" : "Mengubah ke Draft…" : row.status === "Draft" ? "Publish" : "Draft"}</button><button className="button" type="button" onClick={() => setDeleting({ id: row.id, question: false, label: row.title })}>Hapus</button></div></details></div> }} />}</AdminSection>
    <AdminDialog open={Boolean(draft) && packageForm && !deleting} title={`${rows.some(row => row.id === draft?.id) ? "Edit" : "Tambah"} ${title}`} close={requestClose}>{draft && <>
      <form className={`admin-prototype-form ${tryoutStyles.packageForm}`} noValidate onSubmit={save}>
        {packageForm && <div className={tryoutStyles.packageFields}>
        <label className="admin-field">Judul<input required placeholder={mini ? "Contoh: Mini Checkpoint Chapter 1" : "Contoh: Try Out JLPT N4"} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="admin-field">Program<select value={draft.context} onChange={(event) => { setDraft({ ...draft, context: event.target.value }); }} >{contexts.map((value) => <option key={value} value={value}>{programName(value)}</option>)}</select></label>
        {mini && <><label className="admin-field">Chapter<input required placeholder="Contoh: Chapter 1" value={draft.chapter} onChange={(event) => setDraft({ ...draft, chapter: event.target.value })} /></label><label className="admin-field">Sesi<input placeholder="Contoh: 1" type="number" min="1" step="1" value={draft.session} onChange={(event) => setDraft({ ...draft, session: event.target.value })} /></label><label className="admin-field">Part<select value={draft.part} onChange={(event) => setDraft({ ...draft, part: event.target.value })}><option>1</option><option>2</option></select></label></>}
        {!mini && <label className="admin-field">Akses Try Out<select aria-label="Akses Try Out" value={draft.accessType ?? "membership"} onChange={event => setDraft({ ...draft, accessType: event.target.value as "free" | "membership" })}><option value="free">Gratis</option><option value="membership">Memerlukan Membership</option></select></label>}
        <label className="admin-field">Durasi (menit)<input placeholder={mini ? "Contoh: 15" : undefined} type="number" min="1" max={mini ? undefined : 2147483647} step="1" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} /></label>
        <label className="admin-field">Skor maksimal<input placeholder={mini ? "Contoh: 100" : "Contoh: 180"} type="number" min="1" step="1" value={draft.maxScore} onChange={(event) => setDraft({ ...draft, maxScore: event.target.value })} /></label>
        <label className="admin-field">{mini ? "Nilai minimum lulus" : "Nilai minimum lulus keseluruhan"}<input placeholder="Contoh: 0" type="number" min="0" max={draft.maxScore} step={mini ? "any" : "1"} value={draft.passingScore} onChange={(event) => setDraft({ ...draft, passingScore: event.target.value })} /></label>
        {!mini && <fieldset><legend>Nilai minimum lulus per bagian</legend>{assessmentSessions.map((session, index) => <label className="admin-field" key={session}>{assessmentSections(draft)[index]}<input type="number" min="0" step="1" placeholder="Masukkan nilai minimum lulus" value={draft.sessionPassingScores?.[session] ?? ""} onChange={event => setDraft({ ...draft, sessionPassingScores: { ...draft.sessionPassingScores, [session]: event.target.value === "" ? Number.NaN : Number(event.target.value) } })} /></label>)}<p>Isi nilai minimum untuk setiap bagian, atau kosongkan seluruhnya untuk memakai ketentuan penilaian bawaan.</p></fieldset>}
        <label className="admin-field">Urutan<input placeholder="Contoh: 1" type="number" min={mini ? "1" : "0"} step="1" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} /></label>
        <label className="admin-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminAssessment["status"] })}><option>Draft</option><option>Published</option></select></label>
        </div>}
        <p>{draft.questions.length} soal • {assessmentSections(draft).length} sesi</p>
        {error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button className="button" type="button" onClick={requestClose}>Batal</button><button className="button button-primary" type="submit" disabled={busy} aria-busy={pending?.action === "save" && pending.id === draft.id}>{pending?.action === "save" && pending.id === draft.id ? `Menyimpan ${title}…` : `Simpan ${title}`}</button></div>
      </form>
      <button type="button" className="button" onClick={() => setPackageForm(false)}>Kelola Soal</button>
      </>}</AdminDialog>
    <AdminDialog open={confirmClose} title="Tutup builder?" close={() => setConfirmClose(false)} actions={<><button type="button" className="button" onClick={() => setConfirmClose(false)}>Lanjut Mengedit</button><button type="button" className="button button-primary" onClick={() => { setConfirmClose(false); closeEditor(); }}>Buang Perubahan dan Tutup</button></>}><p>Perubahan Try Out belum disimpan. Tutup tanpa menyimpan?</p></AdminDialog>
    <AdminDialog open={Boolean(viewItem)} title={`Detail ${title}`} close={closeView}>{viewItem && <AdminAssessmentPreview key={viewItem.id} assessment={viewItem} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title={`Hapus ${deleting?.question ? "Soal" : title}?`} close={closeDelete} actions={<><button className="button" type="button" onClick={closeDelete}>Batal</button><button className="button button-primary" type="button" onClick={async () => { if (!deleting || !beginWrite("delete", deleting.id)) return; try { if (deleting.question && draft) { const question = draft.questions.find(question => question.id === deleting.id); if (question && /^\d+$/.test(question.id)) setRows(await deleteAdminTryOut(draft.id, question)); setDraft({ ...draft, questions: draft.questions.filter(question => question.id !== deleting.id) }); } else setRows(await deleteAdminTryOut(deleting.id)); closeDelete(); } catch (cause) { setMessage(adminTryOutError(cause)); } finally { endWrite(); } }}>Hapus</button></>}><p>Hapus {deleting?.label} dari sesi ini? Halaman siswa tidak berubah.</p></AdminDialog>
  </main></AdminShell>;
}

export function AdminMiniCheckpointPrototype() { return <AdminQuestionWorkspace kind="Mini Checkpoint" />; }
export function AdminTryoutPrototype({ navigation }: { navigation?: ReactNode } = {}) { return <AssessmentWorkspace kind="tryout" navigation={navigation} />; }
