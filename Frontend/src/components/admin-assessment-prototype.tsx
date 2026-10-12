"use client";

import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLearningRequest } from "@/components/learning-hooks";
import { loadAdminTryOuts, saveAdminTryOut, deleteAdminTryOut, setAdminTryOutStatus, publishAdminTryOutQuestions, adminTryOutError } from "@/lib/admin-tryout-api";
import { LuSearch } from "react-icons/lu";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { AdminAssessmentPreview } from "@/components/admin-assessment-preview";
import { AdminQuestionWorkspace } from "@/components/admin-question-workspace";
import { assessmentError, assessmentLetters, assessmentQuestionError, assessmentSections, copyAssessment, miniAssessmentContexts, orderedAssessmentQuestions, tryoutAssessmentContexts, type AdminAssessment, type AdminAssessmentKind, type AdminAssessmentQuestion } from "@/components/admin-assessment-fixtures";

function AssessmentWorkspace({ kind, navigation }: { kind: AdminAssessmentKind; navigation?: ReactNode }) {
  const mini = kind === "mini";
  const title = mini ? "Mini Checkpoint" : "Try Out";
  const contexts: readonly string[] = mini ? miniAssessmentContexts : tryoutAssessmentContexts;
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
  const [chapter, setChapter] = useState("");
  const [status, setStatus] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");
  const [questionSection, setQuestionSection] = useState("");
  const [questionType, setQuestionType] = useState("");
  const [questionStatus, setQuestionStatus] = useState("");
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
  const closeEditor = useCallback(() => { setDraft(null); setQuestionDraft(null); setDeleting(null); setError(""); }, [setDraft, setQuestionDraft, setDeleting, setError]);
  const closeQuestion = useCallback(() => { setQuestionDraft(null); setError(""); }, [setQuestionDraft, setError]);
  const closeView = useCallback(() => setView(null), [setView]);
  const closeDelete = useCallback(() => setDeleting(null), [setDeleting]);
  const query = search.trim().toLowerCase();
  const visible = rows.filter((row) => (!context || row.context === context) && (!chapter || row.chapter === chapter) && (!status || row.status === status) && [row.title, row.context, row.chapter, row.session, row.part, ...row.questions.map((question) => question?.prompt ?? "")].some((value) => (value ?? "").toLowerCase().includes(query))).sort((a, b) => Number(a.order) - Number(b.order) || a.id.localeCompare(b.id));
  const chapters = [...new Set(rows.filter((row) => !context || row.context === context).map((row) => row.chapter).filter(Boolean))];
  const viewItem = rows.find((row) => row.id === view);
  const questions = draft ? orderedAssessmentQuestions(draft) : [];
  const questionQuery = questionSearch.trim().toLowerCase();
  const visibleQuestions = questions.filter((question) => (!questionSection || question.section === questionSection) && (!questionType || question.type === questionType) && (!questionStatus || question.status === questionStatus) && [question.prompt, question.japanese?.text ?? "", question.section, question.explanation, ...question.answers].some((value) => value.toLowerCase().includes(questionQuery)));
  function edit(item: AdminAssessment) {
    if (busyRef.current) return;
    setDraft(copyAssessment(item)); setError(""); setQuestionSearch(""); setQuestionSection(""); setQuestionType(""); setQuestionStatus("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const issue = assessmentError(draft);
    if (issue) { setError(issue); return; }
    const next = copyAssessment({ ...draft, title: draft.title.trim(), chapter: draft.chapter.trim() });
    if (mini) { setError("OPEN: konfigurasi sesi, part, timer Mini belum tersedia di backend."); return; }
    if (!beginWrite("save", next.id)) return;
    try { setRows(await saveAdminTryOut(next, rows.find(row => row.id === next.id))); closeEditor(); setMessage(`${title} disimpan.`); }
    catch (cause) { setError(adminTryOutError(cause)); }
    finally { endWrite(); }
  }
  function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !questionDraft) return;
    const issue = assessmentQuestionError(questionDraft, draft);
    if (issue) { setError(issue); return; }
    setDraft({ ...draft, questions: draft.questions.some((question) => question.id === questionDraft.id) ? draft.questions.map((question) => question.id === questionDraft.id ? { ...questionDraft, answers: [...questionDraft.answers] } : question) : [...draft.questions, { ...questionDraft, answers: [...questionDraft.answers] }] });
    closeQuestion();
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
  function moveQuestion(item: AdminAssessmentQuestion, direction: -1 | 1) {
    if (!draft) return;
    const siblings = questions.filter((question) => question.section === item.section);
    const index = siblings.findIndex((question) => question.id === item.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    const orders = new Map(siblings.map((question, position) => [question.id, String(position + (mini ? 1 : 0))]));
    setDraft({ ...draft, questions: draft.questions.map((question) => orders.has(question.id) ? { ...question, order: orders.get(question.id)! } : question) });
  }
  const previewDraft = draft && questionDraft ? { ...draft, questions: draft.questions.filter((question) => question.id !== questionDraft.id).concat(questionDraft) } : draft;
  return <AdminShell current={mini ? "/admin/mini-checkpoint" : "/admin/tryout"}><main className="admin-public-prototype admin-assessment-prototype">{navigation}
    <AdminPageHeader title={title} actions={<button className="button button-primary" type="button" onClick={() => edit({ id: crypto.randomUUID(), kind, title: "", context: context || (mini ? "N4" : "N5"), chapter: mini ? chapter : "", session: mini ? "1" : "", part: mini ? "1" : "", duration: "", maxScore: mini ? "100" : "180", passingScore: "", order: String(rows.reduce((max, row) => Math.max(max, Number(row.order)), 0) + 1), status: "Draft", questions: [] })}>Tambah {title}</button>} />
    {mini && <p role="status">OPEN: konfigurasi sesi, part, timer Mini belum tersedia di backend.</p>}{request.error && <p role="alert">{request.error}</p>}<p role="status">{message}</p>
    <AdminSection><AdminFilterToolbar>
      <label className="admin-search-box admin-learning-media-search admin-learning-question-search admin-assessment-search"><input type="search" aria-label={`Cari ${title}`} value={search} onChange={(event) => setSearch(event.target.value)} /><span aria-hidden="true"><LuSearch /></span></label>
      <label className="admin-field">Konteks<select value={context} onChange={(event) => { setContext(event.target.value); setChapter(""); }}><option value="">Semua</option>{contexts.map((value) => <option key={value}>{value}</option>)}</select></label>
      {mini && <label className="admin-field">Chapter<select value={chapter} onChange={(event) => setChapter(event.target.value)}><option value="">Semua</option>{chapters.map((value) => <option key={value}>{value}</option>)}</select></label>}
      <label className="admin-field">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua</option><option>Draft</option><option>Published</option></select></label>
    </AdminFilterToolbar><AdminDataTable loading={request.loading && !request.data && !savedRows} caption={title} rows={visible} rowKey={(row) => row.id} columns={[
      { key: "title", header: "Judul", cell: (row) => row.title },
      { key: "context", header: "Konteks", cell: (row) => `${row.context}${mini ? ` • ${row.chapter} • Sesi ${row.session} • Part ${row.part}` : ""}` },
      { key: "questions", header: "Soal", cell: (row) => `${row.questions.length} soal • ${row.questions.filter(question => question.status === "Draft").length} Draft • ${row.questions.filter(question => question.status === "Published").length} Published` },
      { key: "duration", header: "Durasi", cell: (row) => row.duration ? `${row.duration} menit` : "OPEN" },
      { key: "passing", header: "Passing score", cell: (row) => row.passingScore || "OPEN" },
      { key: "order", header: "Urutan", cell: (row) => row.order },
      { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.status} /> },
    ]} actions={{ cell: (row) => <div className="admin-page-actions"><button className="button" type="button" onClick={() => setView(row.id)}>Lihat</button><button className="button" type="button" onClick={() => edit(row)}>Edit</button><button className="button" type="button" disabled={busy || Boolean(draft)} aria-busy={pending?.action === "questions" && pending.id === row.id} onClick={() => publishQuestions(row)}>{pending?.action === "questions" && pending.id === row.id ? "Mempublikasikan Semua Soal…" : "Publish Semua Soal"}</button><button className="button" type="button" disabled={busy || Boolean(draft)} aria-busy={pending?.action === "status" && pending.id === row.id} onClick={() => toggleAssessment(row)}>{pending?.action === "status" && pending.id === row.id ? row.status === "Draft" ? "Mempublikasikan…" : "Mengubah ke Draft…" : row.status === "Draft" ? "Publish" : "Draft"}</button><button className="button" type="button" onClick={() => setDeleting({ id: row.id, question: false, label: row.title })}>Hapus</button></div> }} /></AdminSection>
    <AdminDialog open={Boolean(draft) && !questionDraft && !deleting} title={`${rows.some((row) => row.id === draft?.id) ? "Edit" : "Tambah"} ${title}`} close={closeEditor}>{draft && <>
      <form className="admin-prototype-form" noValidate onSubmit={save}>
        <label className="admin-field">Judul<input required placeholder={mini ? "Contoh: Mini Checkpoint Chapter 1" : "Contoh: Try Out JLPT N4"} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="admin-field">Konteks<select value={draft.context} onChange={(event) => { setDraft({ ...draft, context: event.target.value }); setQuestionSection(""); }} >{contexts.map((value) => <option key={value}>{value}</option>)}</select></label>
        {mini && <><label className="admin-field">Chapter<input required placeholder="Contoh: Chapter 1" value={draft.chapter} onChange={(event) => setDraft({ ...draft, chapter: event.target.value })} /></label><label className="admin-field">Sesi<input placeholder="Contoh: 1" type="number" min="1" step="1" value={draft.session} onChange={(event) => setDraft({ ...draft, session: event.target.value })} /></label><label className="admin-field">Part<select value={draft.part} onChange={(event) => setDraft({ ...draft, part: event.target.value })}><option>1</option><option>2</option></select></label></>}
        <label className="admin-field">Durasi (menit)<input placeholder={mini ? "Contoh: 15" : undefined} type="number" min="1" max={mini ? undefined : 2147483647} step="1" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} /></label>
        <label className="admin-field">Skor maksimal<input placeholder={mini ? "Contoh: 100" : "Contoh: 180"} type="number" min={mini ? "1" : "76"} step="1" value={draft.maxScore} onChange={(event) => setDraft({ ...draft, maxScore: event.target.value })} /></label>
        <label className="admin-field">{mini ? "Passing score" : "Passing score total"}<input placeholder="Contoh: 0" type="number" min="0" max={draft.maxScore} step="any" value={draft.passingScore} onChange={(event) => setDraft({ ...draft, passingScore: event.target.value })} /></label>
        {!mini && <label className="admin-field">Passing score per sesi<input readOnly value="19" /></label>}
        <label className="admin-field">Urutan<input placeholder="Contoh: 1" type="number" min="1" step="1" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} /></label>
        <label className="admin-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminAssessment["status"] })}><option>Draft</option><option>Published</option></select></label>
        <p>{questions.length} soal • {assessmentSections(draft).length} sesi</p>
        {error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button className="button" type="button" onClick={closeEditor}>Batal</button><button className="button button-primary" type="submit" disabled={busy} aria-busy={pending?.action === "save" && pending.id === draft.id}>{pending?.action === "save" && pending.id === draft.id ? `Menyimpan ${title}…` : `Simpan ${title}`}</button></div>
      </form>
      <AdminSection title="Soal" actions={<button className="button" type="button" onClick={() => { const section = questionSection || assessmentSections(draft)[0]; setError(""); setQuestionDraft({ id: crypto.randomUUID(), section, type: "Multiple choice", prompt: "", instruction: "", answers: ["", "", "", ""], correctAnswer: -1, explanation: "", passage: "", file: null, order: String(draft.questions.filter((question) => question.section === section).reduce((max, question) => Math.max(max, Number(question.order)), 0) + 1), status: "Draft" }); }}>Tambah Soal</button>}>
        <AdminFilterToolbar><label className="admin-search-box admin-learning-media-search admin-learning-question-search admin-assessment-search"><input type="search" aria-label="Cari soal" value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} /><span aria-hidden="true"><LuSearch /></span></label><label className="admin-field">Sesi<select value={questionSection} onChange={(event) => setQuestionSection(event.target.value)}><option value="">Semua</option>{assessmentSections(draft).map((name) => <option key={name}>{name}</option>)}</select></label><label className="admin-field">Tipe<select value={questionType} onChange={(event) => setQuestionType(event.target.value)}><option value="">Semua</option>{(["DASAR", "SSW"].includes(draft.context) ? ["Multiple choice"] : ["Multiple choice", "Audio", "Reading"]).map((value) => <option key={value}>{value}</option>)}</select></label><label className="admin-field">Status soal<select value={questionStatus} onChange={(event) => setQuestionStatus(event.target.value)}><option value="">Semua</option><option>Draft</option><option>Published</option></select></label></AdminFilterToolbar>
        <AdminDataTable caption="Soal" rows={visibleQuestions} rowKey={(question) => question.id} columns={[
          { key: "number", header: "Nomor", cell: (question) => questions.findIndex((item) => item.id === question.id) + 1 },
          { key: "prompt", header: "Pertanyaan", cell: (question) => question.prompt },
          { key: "section", header: "Sesi", cell: (question) => question.section },
          { key: "type", header: "Tipe", cell: (question) => question.type },
          { key: "answer", header: "Jawaban benar", cell: (question) => assessmentLetters[question.correctAnswer] },
          { key: "order", header: "Urutan", cell: (question) => question.order },
          { key: "status", header: "Status", cell: (question) => <AdminStatusBadge status={question.status} /> },
        ]} actions={{ cell: (question) => { const siblings = questions.filter((item) => item.section === question.section); const index = siblings.findIndex((item) => item.id === question.id); return <div className="admin-page-actions"><button className="button" type="button" aria-label={`Edit ${question.prompt}`} onClick={() => { setError(""); setQuestionDraft({ ...question, answers: [...question.answers] }); }}>Edit</button><button className="button" type="button" onClick={() => { const next = { ...question, status: question.status === "Draft" ? "Published" : "Draft" } as AdminAssessmentQuestion; const issue = assessmentQuestionError(next, draft); if (issue) { setError(issue); return; } setDraft({ ...draft, questions: draft.questions.map((item) => item.id === question.id ? next : item) }); }}>{question.status === "Draft" ? "Publish" : "Draft"}</button><button className="button" type="button" aria-label={`Naik ${question.prompt}`} disabled={index <= 0} onClick={() => moveQuestion(question, -1)}>Naik</button><button className="button" type="button" aria-label={`Turun ${question.prompt}`} disabled={index >= siblings.length - 1} onClick={() => moveQuestion(question, 1)}>Turun</button><button className="button" type="button" aria-label={`Hapus ${question.prompt}`} onClick={() => setDeleting({ id: question.id, question: true, label: question.prompt })}>Hapus</button></div>; } }} />
      </AdminSection><AdminAssessmentPreview key={draft.id} assessment={draft} />
    </>}</AdminDialog>
    <AdminDialog open={Boolean(questionDraft) && !deleting} title="Edit Soal" close={closeQuestion}>{questionDraft && draft && <form className="admin-prototype-form" noValidate onSubmit={saveQuestion}>
      <label className="admin-field">Sesi<select value={questionDraft.section} onChange={(event) => setQuestionDraft({ ...questionDraft, section: event.target.value })}>{assessmentSections(draft).map((name) => <option key={name}>{name}</option>)}</select></label>
      <label className="admin-field">Tipe<select value={questionDraft.type} onChange={(event) => setQuestionDraft({ ...questionDraft, type: event.target.value as AdminAssessmentQuestion["type"], file: null, passage: "" })}>{(["DASAR", "SSW"].includes(draft.context) ? ["Multiple choice"] : ["Multiple choice", "Audio", "Reading"]).map((value) => <option key={value}>{value}</option>)}</select></label>
      {questionDraft.type === "Audio" && <AdminMediaUpload kind="audio" onUploaded={audioUrl => setQuestionDraft({ ...questionDraft, audioUrl, file: null })} />}
      {questionDraft.type === "Reading" && <label className="admin-field">Teks bacaan<textarea lang="ja" placeholder="Contoh: 私は毎日学校へ行きます。学校で日本語を勉強します。" value={questionDraft.passage} onChange={(event) => setQuestionDraft({ ...questionDraft, passage: event.target.value })} /></label>}
      {!mini && <><label className="admin-field">Point value<input placeholder="Contoh: 1" type="number" min="1" step="1" value={questionDraft.pointValue ?? ""} onChange={event => setQuestionDraft({ ...questionDraft, pointValue: event.target.valueAsNumber })} /></label>{questionDraft.type === "Audio" && <label className="admin-field">URL audio<input placeholder="Contoh: https://example.com/audio/soal-1.mp3 atau media/tryout/soal-1.mp3" value={questionDraft.audioUrl ?? ""} onChange={event => setQuestionDraft({ ...questionDraft, audioUrl: event.target.value })} /></label>}</>}
      <label className="admin-field">Pertanyaan<textarea required placeholder={questionDraft.type === "Audio" ? "Contoh: Apa yang dikatakan pembicara pada audio tersebut?" : questionDraft.type === "Reading" ? "Contoh: Apa ide utama dari bacaan di atas?" : "Contoh: Apa arti kata 学校?"} value={questionDraft.prompt} onChange={(event) => setQuestionDraft({ ...questionDraft, prompt: event.target.value })} /></label>
      <label className="admin-field">Teks Jepang (opsional)<textarea lang="ja" placeholder="Contoh: 学校" value={questionDraft.japanese?.text ?? ""} onChange={(event) => setQuestionDraft({ ...questionDraft, japanese: { ...questionDraft.japanese, text: event.target.value } })} /></label>
      <label className="admin-field">Furigana (opsional)<input lang="ja" placeholder="Contoh: がっこう" value={questionDraft.japanese?.reading ?? ""} onChange={(event) => setQuestionDraft({ ...questionDraft, japanese: { text: questionDraft.japanese?.text ?? "", reading: event.target.value } })} /></label>
      <label className="admin-field">Instruksi (opsional)<textarea placeholder="Contoh: Pilih satu jawaban yang paling tepat." value={questionDraft.instruction} onChange={(event) => setQuestionDraft({ ...questionDraft, instruction: event.target.value })} /></label>
      {assessmentLetters.map((letter, index) => <label className="admin-field" key={letter}>Pilihan {letter}<input required placeholder={`Contoh: ${["Sekolah", "Rumah", "Kantor", "Perpustakaan"][index]}`} value={questionDraft.answers[index]} onChange={(event) => setQuestionDraft({ ...questionDraft, answers: questionDraft.answers.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer) })} /></label>)}
      <label className="admin-field">Jawaban benar<select value={questionDraft.correctAnswer} onChange={(event) => setQuestionDraft({ ...questionDraft, correctAnswer: Number(event.target.value) })}><option value={-1}>Pilih jawaban</option>{assessmentLetters.map((letter, index) => <option key={letter} value={index}>{letter}</option>)}</select></label>
      <label className="admin-field">Penjelasan (opsional)<textarea placeholder="Contoh: 学校 berarti sekolah, sehingga pilihan A adalah jawaban yang tepat." value={questionDraft.explanation} onChange={(event) => setQuestionDraft({ ...questionDraft, explanation: event.target.value })} /></label>
      <label className="admin-field">Urutan<input placeholder="Contoh: 1" type="number" min={mini ? "1" : "0"} step="1" value={questionDraft.order} onChange={(event) => setQuestionDraft({ ...questionDraft, order: event.target.value })} /></label>
      <label className="admin-field">Status<select value={questionDraft.status} onChange={(event) => setQuestionDraft({ ...questionDraft, status: event.target.value as AdminAssessmentQuestion["status"] })}><option>Draft</option><option>Published</option></select></label>
      {previewDraft && <AdminAssessmentPreview key={questionDraft.id} assessment={previewDraft} initialQuestionId={questionDraft.id} />}{error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button className="button" type="button" onClick={closeQuestion}>Batal</button><button className="button button-primary" type="submit">Simpan Soal</button></div>
    </form>}</AdminDialog>
    <AdminDialog open={Boolean(viewItem)} title={`Detail ${title}`} close={closeView}>{viewItem && <AdminAssessmentPreview key={viewItem.id} assessment={viewItem} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title={`Hapus ${deleting?.question ? "Soal" : title}?`} close={closeDelete} actions={<><button className="button" type="button" onClick={closeDelete}>Batal</button><button className="button button-primary" type="button" onClick={async () => { if (!deleting || !beginWrite("delete", deleting.id)) return; try { if (deleting.question && draft) { const question = draft.questions.find(question => question.id === deleting.id); if (question && /^\d+$/.test(question.id)) setRows(await deleteAdminTryOut(draft.id, question)); setDraft({ ...draft, questions: draft.questions.filter(question => question.id !== deleting.id) }); } else setRows(await deleteAdminTryOut(deleting.id)); closeDelete(); } catch (cause) { setMessage(adminTryOutError(cause)); } finally { endWrite(); } }}>Hapus</button></>}><p>Hapus {deleting?.label} dari sesi ini? Halaman siswa tidak berubah.</p></AdminDialog>
  </main></AdminShell>;
}

export function AdminMiniCheckpointPrototype() { return <AdminQuestionWorkspace kind="Mini Checkpoint" />; }
export function AdminTryoutPrototype({ navigation }: { navigation?: ReactNode } = {}) { return <AssessmentWorkspace kind="tryout" navigation={navigation} />; }
