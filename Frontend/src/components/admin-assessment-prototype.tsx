"use client";

import { useCallback, useState, type FormEvent } from "react";
import { LuSearch } from "react-icons/lu";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { AdminAssessmentPreview } from "@/components/admin-assessment-preview";
import { assessmentError, assessmentLetters, assessmentQuestionError, assessmentSections, copyAssessment, createAssessmentFixtures, miniAssessmentContexts, orderedAssessmentQuestions, tryoutAssessmentContexts, validAssessmentAudio, type AdminAssessment, type AdminAssessmentKind, type AdminAssessmentQuestion } from "@/components/admin-assessment-fixtures";

function AssessmentWorkspace({ kind }: { kind: AdminAssessmentKind }) {
  const mini = kind === "mini";
  const title = mini ? "Mini Checkpoint" : "Try Out";
  const contexts: readonly string[] = mini ? miniAssessmentContexts : tryoutAssessmentContexts;
  const [rows, setRows] = useState(() => createAssessmentFixtures(kind));
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
  const closeEditor = useCallback(() => { setDraft(null); setQuestionDraft(null); setDeleting(null); setError(""); }, []);
  const closeQuestion = useCallback(() => { setQuestionDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const query = search.trim().toLowerCase();
  const visible = rows.filter((row) => (!context || row.context === context) && (!chapter || row.chapter === chapter) && (!status || row.status === status) && [row.title, row.context, row.chapter, row.session, row.part, ...row.questions.map((question) => question.prompt)].some((value) => value.toLowerCase().includes(query))).sort((a, b) => Number(a.order) - Number(b.order) || a.id.localeCompare(b.id));
  const chapters = [...new Set(rows.filter((row) => !context || row.context === context).map((row) => row.chapter).filter(Boolean))];
  const viewItem = rows.find((row) => row.id === view);
  const questions = draft ? orderedAssessmentQuestions(draft) : [];
  const questionQuery = questionSearch.trim().toLowerCase();
  const visibleQuestions = questions.filter((question) => (!questionSection || question.section === questionSection) && (!questionType || question.type === questionType) && (!questionStatus || question.status === questionStatus) && [question.prompt, question.japanese?.text ?? "", question.section, question.explanation, ...question.answers].some((value) => value.toLowerCase().includes(questionQuery)));
  function edit(item: AdminAssessment) {
    setDraft(copyAssessment(item)); setError(""); setQuestionSearch(""); setQuestionSection(""); setQuestionType(""); setQuestionStatus("");
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const issue = assessmentError(draft);
    if (issue) { setError(issue); return; }
    const next = copyAssessment({ ...draft, title: draft.title.trim(), chapter: draft.chapter.trim() });
    setRows((current) => current.some((row) => row.id === next.id) ? current.map((row) => row.id === next.id ? next : row) : [...current, next]);
    closeEditor(); setMessage(`${title} disimpan untuk sesi ini. Halaman siswa tidak berubah.`);
  }
  function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !questionDraft) return;
    const issue = assessmentQuestionError(questionDraft, draft);
    if (issue) { setError(issue); return; }
    setDraft({ ...draft, questions: draft.questions.some((question) => question.id === questionDraft.id) ? draft.questions.map((question) => question.id === questionDraft.id ? { ...questionDraft, answers: [...questionDraft.answers] } : question) : [...draft.questions, { ...questionDraft, answers: [...questionDraft.answers] }] });
    closeQuestion();
  }
  function toggleAssessment(item: AdminAssessment) {
    const next = { ...item, status: item.status === "Draft" ? "Published" : "Draft" } as AdminAssessment;
    const issue = assessmentError(next);
    if (issue) { setMessage(issue); return; }
    setRows((current) => current.map((row) => row.id === item.id ? next : row)); setMessage("Status diubah untuk sesi ini. Halaman siswa tidak berubah.");
  }
  function moveQuestion(item: AdminAssessmentQuestion, direction: -1 | 1) {
    if (!draft) return;
    const siblings = questions.filter((question) => question.section === item.section);
    const index = siblings.findIndex((question) => question.id === item.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    const orders = new Map(siblings.map((question, position) => [question.id, String(position + 1)]));
    setDraft({ ...draft, questions: draft.questions.map((question) => orders.has(question.id) ? { ...question, order: orders.get(question.id)! } : question) });
  }
  const previewDraft = draft && questionDraft ? { ...draft, questions: draft.questions.filter((question) => question.id !== questionDraft.id).concat(questionDraft) } : draft;
  return <AdminShell current={mini ? "/admin/mini-checkpoint" : "/admin/tryout"}><main className="admin-public-prototype admin-assessment-prototype">
    <AdminPageHeader title={title} actions={<button className="button button-primary" type="button" onClick={() => edit({ id: crypto.randomUUID(), kind, title: "", context: context || (mini ? "N4" : "N5"), chapter: mini ? chapter : "", session: mini ? "1" : "", part: mini ? "1" : "", duration: mini ? "" : "125", maxScore: mini ? "100" : "180", passingScore: "", order: String(rows.reduce((max, row) => Math.max(max, Number(row.order)), 0) + 1), status: "Draft", questions: [] })}>Tambah {title}</button>} />
    <p>Data runtime React saja. OPEN: copy baru, durasi Mini Checkpoint, chapter fixture, dan aturan skor final perlu konfirmasi.</p><p role="status">{message}</p>
    <AdminSection><AdminFilterToolbar>
      <label className="admin-search-box admin-learning-media-search admin-learning-question-search admin-assessment-search"><input type="search" aria-label={`Cari ${title}`} value={search} onChange={(event) => setSearch(event.target.value)} /><span aria-hidden="true"><LuSearch /></span></label>
      <label className="admin-field">Konteks<select value={context} onChange={(event) => { setContext(event.target.value); setChapter(""); }}><option value="">Semua</option>{contexts.map((value) => <option key={value}>{value}</option>)}</select></label>
      {mini && <label className="admin-field">Chapter<select value={chapter} onChange={(event) => setChapter(event.target.value)}><option value="">Semua</option>{chapters.map((value) => <option key={value}>{value}</option>)}</select></label>}
      <label className="admin-field">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua</option><option>Draft</option><option>Published</option></select></label>
    </AdminFilterToolbar><AdminDataTable caption={title} rows={visible} rowKey={(row) => row.id} columns={[
      { key: "title", header: "Judul", cell: (row) => row.title },
      { key: "context", header: "Konteks", cell: (row) => `${row.context}${mini ? ` • ${row.chapter} • Sesi ${row.session} • Part ${row.part}` : ""}` },
      { key: "questions", header: "Soal", cell: (row) => row.questions.length },
      { key: "duration", header: "Durasi", cell: (row) => row.duration ? `${row.duration} menit` : "OPEN" },
      { key: "passing", header: "Passing score", cell: (row) => row.passingScore || "OPEN" },
      { key: "order", header: "Urutan", cell: (row) => row.order },
      { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.status} /> },
    ]} actions={{ cell: (row) => <div className="admin-page-actions"><button className="button" type="button" onClick={() => setView(row.id)}>Lihat</button><button className="button" type="button" onClick={() => edit(row)}>Edit</button><button className="button" type="button" onClick={() => toggleAssessment(row)}>{row.status === "Draft" ? "Publish" : "Draft"}</button><button className="button" type="button" onClick={() => setDeleting({ id: row.id, question: false, label: row.title })}>Hapus</button></div> }} /></AdminSection>
    <AdminDialog open={Boolean(draft) && !questionDraft && !deleting} title={`${rows.some((row) => row.id === draft?.id) ? "Edit" : "Tambah"} ${title}`} close={closeEditor}>{draft && <>
      <form className="admin-prototype-form" noValidate onSubmit={save}>
        <label className="admin-field">Judul<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="admin-field">Konteks<select value={draft.context} onChange={(event) => { setDraft({ ...draft, context: event.target.value }); setQuestionSection(""); }} >{contexts.map((value) => <option key={value}>{value}</option>)}</select></label>
        {mini && <><label className="admin-field">Chapter<input required value={draft.chapter} onChange={(event) => setDraft({ ...draft, chapter: event.target.value })} /></label><label className="admin-field">Sesi<input type="number" min="1" step="1" value={draft.session} onChange={(event) => setDraft({ ...draft, session: event.target.value })} /></label><label className="admin-field">Part<select value={draft.part} onChange={(event) => setDraft({ ...draft, part: event.target.value })}><option>1</option><option>2</option></select></label></>}
        <label className="admin-field">Durasi (menit)<input type="number" min="1" step="1" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} /></label>
        <label className="admin-field">Skor maksimal<input type="number" min={mini ? "1" : "76"} step="1" value={draft.maxScore} onChange={(event) => setDraft({ ...draft, maxScore: event.target.value })} /></label>
        <label className="admin-field">{mini ? "Passing score" : "Passing score total"}<input type="number" min="0" max={draft.maxScore} step="any" value={draft.passingScore} onChange={(event) => setDraft({ ...draft, passingScore: event.target.value })} /></label>
        {!mini && <label className="admin-field">Passing score per sesi<input readOnly value="19" /></label>}
        <label className="admin-field">Urutan<input type="number" min="1" step="1" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} /></label>
        <label className="admin-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminAssessment["status"] })}><option>Draft</option><option>Published</option></select></label>
        <p>{questions.length} soal • {assessmentSections(draft).length} sesi</p>
        {error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button className="button" type="button" onClick={closeEditor}>Batal</button><button className="button button-primary" type="submit">Simpan {title}</button></div>
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
      {questionDraft.type === "Audio" && <><label className="admin-field">File audio (opsional)<input type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!validAssessmentAudio(file)) { setError("Pilih file audio yang valid dan tidak kosong."); return; } setError(""); setQuestionDraft({ ...questionDraft, file }); }} /></label>{questionDraft.file ? <div className="admin-learning-media-file"><span>{questionDraft.file.name} • {questionDraft.file.size.toLocaleString("id-ID")} byte</span><button className="button" type="button" onClick={() => setQuestionDraft({ ...questionDraft, file: null })}>Hapus file</button></div> : <p>OPEN: file audio lokal belum tersedia.</p>}</>}
      {questionDraft.type === "Reading" && <label className="admin-field">Teks bacaan<textarea lang="ja" value={questionDraft.passage} onChange={(event) => setQuestionDraft({ ...questionDraft, passage: event.target.value })} /></label>}
      <label className="admin-field">Pertanyaan<textarea required value={questionDraft.prompt} onChange={(event) => setQuestionDraft({ ...questionDraft, prompt: event.target.value })} /></label>
      <label className="admin-field">Teks Jepang (opsional)<textarea lang="ja" value={questionDraft.japanese?.text ?? ""} onChange={(event) => setQuestionDraft({ ...questionDraft, japanese: { ...questionDraft.japanese, text: event.target.value } })} /></label>
      <label className="admin-field">Furigana (opsional)<input lang="ja" value={questionDraft.japanese?.reading ?? ""} onChange={(event) => setQuestionDraft({ ...questionDraft, japanese: { text: questionDraft.japanese?.text ?? "", reading: event.target.value } })} /></label>
      <label className="admin-field">Instruksi (opsional)<textarea value={questionDraft.instruction} onChange={(event) => setQuestionDraft({ ...questionDraft, instruction: event.target.value })} /></label>
      {assessmentLetters.map((letter, index) => <label className="admin-field" key={letter}>Pilihan {letter}<input required value={questionDraft.answers[index]} onChange={(event) => setQuestionDraft({ ...questionDraft, answers: questionDraft.answers.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer) })} /></label>)}
      <label className="admin-field">Jawaban benar<select value={questionDraft.correctAnswer} onChange={(event) => setQuestionDraft({ ...questionDraft, correctAnswer: Number(event.target.value) })}><option value={-1}>Pilih jawaban</option>{assessmentLetters.map((letter, index) => <option key={letter} value={index}>{letter}</option>)}</select></label>
      <label className="admin-field">Penjelasan (opsional)<textarea value={questionDraft.explanation} onChange={(event) => setQuestionDraft({ ...questionDraft, explanation: event.target.value })} /></label>
      <label className="admin-field">Urutan<input type="number" min="1" step="1" value={questionDraft.order} onChange={(event) => setQuestionDraft({ ...questionDraft, order: event.target.value })} /></label>
      <label className="admin-field">Status<select value={questionDraft.status} onChange={(event) => setQuestionDraft({ ...questionDraft, status: event.target.value as AdminAssessmentQuestion["status"] })}><option>Draft</option><option>Published</option></select></label>
      {previewDraft && <AdminAssessmentPreview key={questionDraft.id} assessment={previewDraft} initialQuestionId={questionDraft.id} />}{error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button className="button" type="button" onClick={closeQuestion}>Batal</button><button className="button button-primary" type="submit">Simpan Soal</button></div>
    </form>}</AdminDialog>
    <AdminDialog open={Boolean(viewItem)} title={`Detail ${title}`} close={closeView}>{viewItem && <AdminAssessmentPreview key={viewItem.id} assessment={viewItem} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title={`Hapus ${deleting?.question ? "Soal" : title}?`} close={closeDelete} actions={<><button className="button" type="button" onClick={closeDelete}>Batal</button><button className="button button-primary" type="button" onClick={() => { if (!deleting) return; if (deleting.question && draft) setDraft({ ...draft, questions: draft.questions.filter((question) => question.id !== deleting.id) }); else setRows((current) => current.filter((row) => row.id !== deleting.id)); closeDelete(); }}>Hapus</button></>}><p>Hapus {deleting?.label} dari sesi ini? Halaman siswa tidak berubah.</p></AdminDialog>
  </main></AdminShell>;
}

export function AdminMiniCheckpointPrototype() { return <AssessmentWorkspace kind="mini" />; }
export function AdminTryoutPrototype() { return <AssessmentWorkspace kind="tryout" />; }
