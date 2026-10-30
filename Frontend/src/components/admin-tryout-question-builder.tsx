"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { FiSave, FiPlus, FiBookOpen, FiChevronLeft, FiChevronRight, FiChevronDown, FiSearch, FiCopy, FiTrash2, FiArrowUp, FiArrowDown, FiCheckCircle, FiAlertCircle } from "react-icons/fi";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { AdminDialog, AdminTabs, AdminStatusBadge } from "@/components/admin-primitives";
import { PlacementRichText, PlacementTextEditor, PlacementEditorProvider, PlacementEditorToolbar } from "@/components/placement-rich-text";
import { assessmentLetters, assessmentQuestionError, assessmentSections, orderedAssessmentQuestions, type AdminAssessment, type AdminAssessmentQuestion } from "@/components/admin-assessment-fixtures";
import { placementText } from "@/lib/placement-rich-text";
import styles from "./admin-tryout-builder.module.css";

const labels = ["Kosakata & Kanji", "Tata Bahasa", "Reading (Dokkai)", "Audio (Choukai)"];

export function AdminTryoutQuestionBuilder({ draft, initialQuestion, onDirtyChange, busy, error, onChange, onSave, onClose, saveStatus, navigation, bulkAction, readingOnly = false, studioTitle, saveLabel }: {
  readingOnly?: boolean;
  studioTitle?: string;
  saveLabel?: string;
  navigation?: ReactNode;
  bulkAction?: ReactNode;
  saveStatus: string;
  draft: AdminAssessment; initialQuestion: AdminAssessmentQuestion | null; busy: boolean; error: string;
  onChange: (draft: AdminAssessment) => void; onSave: (draft: AdminAssessment) => Promise<void>; onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onDelete: (question: AdminAssessmentQuestion) => Promise<void>;
}) {
  const title = studioTitle ?? (draft.kind === "checkpoint" ? "Checkpoint" : "Try Out");
  const sections = assessmentSections(draft);
  const [session, setSession] = useState(() => readingOnly ? 2 : Math.max(0, sections.indexOf(initialQuestion?.section ?? sections[0])));
  const [activeId, setActiveId] = useState(initialQuestion?.id ?? orderedAssessmentQuestions(draft)[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState(false);
  const [groupForm, setGroupForm] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupBody, setGroupBody] = useState("");
  const [groupCount, setGroupCount] = useState("5");
  const [issue, setIssue] = useState("");
  const [remove, setRemove] = useState<"question" | "group" | null>(null);
  const questions = orderedAssessmentQuestions(draft).filter(question => question.section === sections[session]);
  const active = questions.find(question => question.id === activeId) ?? (readingOnly ? questions[0] : undefined);
  const passage = draft.passages?.find(item => item.id === active?.passageId);
  const linked = questions.filter(question => question.passageId === passage?.id && passage);
  useEffect(() => { onDirtyChange(false); }, [onDirtyChange]);
  function update(question: AdminAssessmentQuestion) {
    onChange({ ...draft, questions: draft.questions.map(item => item.id === question.id ? question : item) });
  }
  function newQuestion(passageId?: string, offset = 0): AdminAssessmentQuestion {
    return { id: crypto.randomUUID(), section: sections[session], type: session === 2 ? "Reading" : session === 3 ? "Audio" : "Multiple choice", prompt: "", answers: ["", "", "", ""], correctAnswer: -1, instruction: "", explanation: "", passage: "", passageId: passageId ?? null, file: null, order: String(questions.reduce((max, question) => Math.max(max, Number(question.order)), -1) + 1 + offset), status: "Draft" };
  }
  function add(passageId?: string) {
    const question = newQuestion(passageId);
    if (readingOnly && !passageId) {
      const group = { id: crypto.randomUUID(), title: "", body: "" };
      question.passageId = group.id;
      onChange({ ...draft, passages: [...draft.passages ?? [], group], questions: [...draft.questions, question] });
    } else onChange({ ...draft, questions: [...draft.questions, question] });
    setActiveId(question.id); setPreview(false); setSearch("");
  }
  function addGroup() {
    const count = Number(groupCount);
    if (!groupTitle.trim() || !placementText(groupBody).trim() || !Number.isSafeInteger(count) || count < 1) { setIssue("Isi judul, bacaan, dan jumlah soal positif."); return; }
    const group = { id: crypto.randomUUID(), title: groupTitle.trim(), body: groupBody };
    const slots = Array.from({ length: count }, (_, index) => newQuestion(group.id, index));
    onChange({ ...draft, passages: [...draft.passages ?? [], group], questions: [...draft.questions, ...slots] });
    setActiveId(slots[0].id); setGroupForm(false); setGroupTitle(""); setGroupBody(""); setIssue(""); setPreview(false);
  }
  function moveGroup(direction: number) {
    if (!passage) return;
    const blocks = questions.reduce<AdminAssessmentQuestion[][]>((items, question) => {
      const previous = items.at(-1);
      if (question.passageId && previous?.[0].passageId === question.passageId) previous.push(question);
      else items.push([question]);
      return items;
    }, []);
    const index = blocks.findIndex(block => block[0].passageId === passage.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    const reordered = blocks.flat().map((question, order) => ({ ...question, order: String(order) }));
    onChange({ ...draft, questions: [...draft.questions.filter(question => question.section !== sections[session]), ...reordered] });
  }
  function moveQuestion(direction: number) {
    if (!active) return;
    const siblings = questions.filter(question => question.passageId === active.passageId);
    const index = siblings.findIndex(question => question.id === active.id);
    const target = siblings[index + direction];
    if (!target) return;
    const orders = questions.map(question => question.order);
    const reordered = [...questions];
    const from = reordered.indexOf(active), to = reordered.indexOf(target);
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    onChange({ ...draft, questions: [...draft.questions.filter(question => question.section !== sections[session]), ...reordered.map((question, index) => ({ ...question, order: orders[index] }))] });
  }
  const groupNumbers = linked.map(question => questions.indexOf(question) + 1);
  const groupRange = groupNumbers.length ? `${groupNumbers[0]}–${groupNumbers.at(-1)}` : "";
  const position = questions.findIndex(question => question.id === active?.id);
  const visible = questions.filter(question => placementText(question.prompt).toLowerCase().includes(search.toLowerCase()) || String(questions.indexOf(question) + 1) === search);
  const questionNavigation = <nav className={styles.editorFooter} aria-label="Navigasi soal"><button type="button" className="button" disabled={position <= 0} onClick={() => setActiveId(questions[position - 1].id)} aria-label="Soal Sebelumnya"><FiChevronLeft aria-hidden="true" />Sebelumnya</button><span>Soal {position + 1} / {questions.length}</span><button type="button" className="button" disabled={position >= questions.length - 1} onClick={() => setActiveId(questions[position + 1].id)} aria-label="Soal Berikutnya">Berikutnya<FiChevronRight aria-hidden="true" /></button></nav>;
  const groupMenu = <details className={styles.actionMenu}><summary>Aksi grup bacaan</summary><div className={styles.secondaryActions}>
    <button type="button" className="button" disabled={busy} onClick={() => add(passage?.id)}><FiPlus aria-hidden="true" />Soal untuk Bacaan Ini</button>
    <button type="button" className="button" disabled={busy} onClick={() => moveGroup(-1)}>Grup Sebelumnya</button>
    <button type="button" className="button" disabled={busy} onClick={() => moveGroup(1)}>Grup Berikutnya</button>
    <button type="button" className={`button ${styles.danger}`} disabled={busy} onClick={() => setRemove("group")}><FiTrash2 aria-hidden="true" />Hapus Grup</button>
  </div></details>;
  return <section className={styles.questionBuilder} aria-label={`HIRU ${title.toUpperCase()} STUDIO`}>
    <header className={styles.studioHeader}>
      <h1>{draft.title}</h1>
      <div className={styles.metadata}><span>{readingOnly ? draft.context : `JLPT ${draft.context.toUpperCase().replace(/^JLPT\s*/, "")}`}</span>{!readingOnly && <AdminStatusBadge status={draft.status} />}</div>
    </header>
    {(issue || error) && <p role="alert">{issue || error}</p>}
    {!readingOnly && <AdminTabs tabs={labels} active={labels[session]} label={`Sesi ${title}`} onChange={label => { const next = labels.indexOf(label); setSession(next); setActiveId(orderedAssessmentQuestions(draft).find(question => question.section === sections[next])?.id ?? ""); setSearch(""); setPreview(false); }} />}
    <div className={styles.sessionContext}>
      <div><h2>{labels[session]}</h2><p>{questions.length} soal{session === 2 && passage ? ` / ${passage.title} / Nomor ${groupRange}` : ""}</p></div>
      <div className={styles.studioNavigation}>{navigation}<AdminTabs tabs={["Editor", "Pratinjau Siswa"]} active={preview ? "Pratinjau Siswa" : "Editor"} label="Mode editor" onChange={value => setPreview(value !== "Editor")} /></div>
    </div>
    <div className={styles.studioPanels}>
      <aside id="studio-navigator" className={styles.studioNavigator} aria-label="Navigator Konten">
        <div className={styles.listHeading}><h2>{session === 2 ? "Struktur Reading" : "Daftar Soal"}</h2><span>{questions.length} soal</span></div>
        <label className={`admin-field ${styles.searchField}`}><span><FiSearch aria-hidden="true" />Cari soal</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <ol aria-label="Daftar pertanyaan">{visible.map((question, index) => <Fragment key={question.id}>
          {question.passageId && visible[index - 1]?.passageId !== question.passageId && <li className={styles.navigatorGroup}><FiBookOpen aria-hidden="true" /><strong>{draft.passages?.find(item => item.id === question.passageId)?.title}</strong></li>}
          <li data-passage={question.passageId || undefined}><button type="button" aria-current={active?.id === question.id ? "step" : undefined} onClick={() => { setActiveId(question.id); setPreview(false); }}><strong className={styles.questionNumber}><span className={styles.srOnly}>Soal </span>{String(questions.indexOf(question) + 1).padStart(2, "0")}</strong><span className={styles.summary}>{placementText(question.prompt) || "Pertanyaan belum diisi"}</span><small>{assessmentQuestionError(readingOnly ? { ...question, pointValue: 1 } : question, draft) ? <FiAlertCircle aria-hidden="true" /> : <FiCheckCircle aria-hidden="true" />}{assessmentQuestionError(readingOnly ? { ...question, pointValue: 1 } : question, draft) ? "Belum lengkap" : "Lengkap"}</small></button></li>
        </Fragment>)}</ol>
        <div className={styles.navigatorActions}><button type="button" className="button" disabled={busy} onClick={() => add()}><FiPlus aria-hidden="true" />Tambah Soal</button>{session === 2 && <button type="button" className="button" disabled={busy} onClick={() => setGroupForm(true)}><FiBookOpen aria-hidden="true" />Tambah Grup Bacaan</button>}</div>
      </aside>
      <section className={styles.studioEditor} aria-label="Editor Konten">
        {active ? preview ? <div className={styles.previewReading} aria-label="Pratinjau Siswa" role="region" key={active.id}>
          {session === 2 && <section className={styles.passageEditor} aria-label="Teks bacaan"><span className={styles.eyebrow}>{passage ? "Bacaan Bersama" : "Teks Bacaan"}</span><h3>{passage?.title ?? "Teks Bacaan"}</h3><PlacementRichText value={passage?.body ?? active.passage} /></section>}
          <section className={styles.questionCard}><span className={styles.eyebrow}>Pertanyaan</span><h3>Soal {position + 1} dari {questions.length}</h3>{active.instruction && <PlacementRichText value={active.instruction} />}{active.type === "Audio" && active.audioUrl && <audio controls src={active.audioUrl} />}<h3><PlacementRichText value={active.prompt} /></h3><fieldset className={styles.previewOptions}><legend>Pilihan jawaban pratinjau</legend>{active.answers.map((answer, index) => <label key={index}><input type="radio" name={`preview-${active.id}`} /><b>{assessmentLetters[index]}</b><PlacementRichText value={answer} /></label>)}</fieldset>{questionNavigation}</section>
        </div> : <PlacementEditorProvider key={active.id}>
          <div className={styles.editorStack}>
            {session === 2 && <details open className={styles.passageEditor} key={passage?.id ?? active.id}><summary><span><span className={styles.eyebrow}>{passage ? "BACAAN BERSAMA" : "BACAAN MANDIRI"}</span><strong>{passage?.title ?? "Teks Bacaan"}</strong></span><FiChevronDown className={styles.passageChevron} aria-hidden="true" /></summary><fieldset className={styles.editorFields} disabled={busy}>
              {passage ? <><label className="admin-field">Judul internal bacaan<input value={passage.title} onChange={event => onChange({ ...draft, passages: draft.passages?.map(item => item.id === passage.id ? { ...item, title: event.target.value } : item) })} /></label><PlacementTextEditor shared disabled={busy} label="Bacaan Bersama" value={passage.body} onChange={body => onChange({ ...draft, passages: draft.passages?.map(item => item.id === passage.id ? { ...item, body } : item) })} /><p className={styles.linkedHint}>Terhubung ke {linked.length} soal / Nomor {groupRange}.</p>{groupMenu}</> : <>{Boolean(draft.passages?.length) && <label className="admin-field">Hubungkan ke grup bacaan<select value="" onChange={event => update({ ...active, passageId: event.target.value || null, passage: "" })}><option value="">Tetap bacaan mandiri</option>{draft.passages?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}<p className={styles.linkedHint}>Bacaan ini hanya untuk soal aktif. Gunakan Tambah Grup Bacaan di navigator untuk membuat bacaan bersama beberapa soal.</p><PlacementTextEditor shared disabled={busy} label="Bacaan Mandiri" value={active.passage} onChange={body => update({ ...active, passage: body })} /></>}
            </fieldset></details>}
            {!groupForm && <div className={styles.sharedToolbar}><PlacementEditorToolbar disabled={busy} /></div>}
            <section className={styles.questionCard} aria-label="Editor Pertanyaan">
              <header className={styles.cardHeading}><div><span className={styles.eyebrow}>EDITOR PERTANYAAN</span><h3>Soal {position + 1} <small>dari {questions.length}</small></h3></div><details className={styles.actionMenu}><summary>Aksi soal</summary><div className={styles.secondaryActions}>
                <button type="button" className="button" disabled={busy} onClick={() => moveQuestion(-1)}><FiArrowUp aria-hidden="true" />Naikkan Soal</button>
                <button type="button" className="button" disabled={busy} onClick={() => moveQuestion(1)}><FiArrowDown aria-hidden="true" />Turunkan Soal</button>
                <button type="button" className="button" disabled={busy} onClick={() => { const copy = { ...active, id: crypto.randomUUID(), order: String(questions.reduce((max, question) => Math.max(max, Number(question.order)), -1) + 1) }; onChange({ ...draft, questions: [...draft.questions, copy] }); setActiveId(copy.id); }}><FiCopy aria-hidden="true" />Duplikat Soal</button>
                <button type="button" className={`button ${styles.danger}`} disabled={busy} onClick={() => setRemove("question")}><FiTrash2 aria-hidden="true" />Hapus Soal</button>
              </div></details></header>
              <fieldset className={styles.editorFields} disabled={busy}>
                {active.type === "Audio" && <><AdminMediaUpload kind="audio" onUploaded={audioUrl => update({ ...active, audioUrl })} /><label className="admin-field">URL audio<input value={active.audioUrl ?? ""} onChange={event => update({ ...active, audioUrl: event.target.value })} /></label></>}
                <PlacementTextEditor shared disabled={busy} label="Pertanyaan" value={active.prompt} onChange={prompt => update({ ...active, prompt })} />
                <section className={styles.answerSection} aria-label="Pilihan Jawaban"><h3>Pilihan Jawaban</h3><div className={styles.studioGrid}>{active.answers.map((answer, index) => <div key={index} className={`${styles.studioAnswer} ${index === active.correctAnswer ? styles.correctAnswer : ""}`}><PlacementTextEditor shared disabled={busy} label={`Pilihan ${assessmentLetters[index]}`} value={answer} onChange={value => update({ ...active, answers: active.answers.map((answer, position) => index === position ? value : answer) })} /></div>)}</div></section>
                <label className="admin-field">Kunci Jawaban<select aria-label="Jawaban Benar" value={active.correctAnswer} onChange={event => update({ ...active, correctAnswer: Number(event.target.value) })}><option value={-1}>Pilih kunci jawaban</option>{active.answers.map((_, index) => <option key={index} value={index}>{assessmentLetters[index]}</option>)}</select></label>
                <PlacementTextEditor shared disabled={busy} label="Pembahasan" value={active.explanation} onChange={explanation => update({ ...active, explanation })} />
                <details className={styles.settings}><summary>Pengaturan soal</summary><div className={styles.studioGrid}>{!readingOnly && <label className="admin-field">Bobot poin<input type="number" min="1" max="180" step="1" value={active.pointValue ?? ""} onChange={event => update({ ...active, pointValue: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>}<label className="admin-field">Status soal<select value={active.status} onChange={event => update({ ...active, status: event.target.value as AdminAssessmentQuestion["status"] })}><option>Draft</option><option>Published</option></select></label></div></details>
              </fieldset>
              {questionNavigation}
            </section>
          </div>
        </PlacementEditorProvider> : <p>Pilih soal atau tambahkan konten untuk mulai mengedit.</p>}
      </section>
    </div>
    <footer className={styles.studioActions} aria-label="Aksi Studio"><p role="status">{saveStatus}</p><div>{bulkAction}<button type="button" className="button" disabled={busy} onClick={onClose}>Kembali ke Daftar</button><button type="button" className="button button-primary" disabled={busy} aria-busy={busy} onClick={() => void onSave(draft)}><FiSave aria-hidden="true" />{busy ? "Menyimpan..." : saveLabel ?? `Simpan ${title}`}</button></div></footer>
    <AdminDialog open={groupForm} title="Grup Bacaan Reading" className={styles.packageDialog} close={() => setGroupForm(false)} actions={<><button className="button" type="button" onClick={() => setGroupForm(false)}>Kembali</button><button className="button button-primary" type="submit" form="tryout-reading-group" disabled={busy}>Buat Grup</button></>}>
      <form id="tryout-reading-group" className={styles.groupForm} onSubmit={event => { event.preventDefault(); addGroup(); }}>
        <p className={styles.linkedHint}>Satu bacaan bersama untuk beberapa soal Reading.</p>
        <label className="admin-field">Judul internal bacaan<input required value={groupTitle} placeholder="Contoh: Bacaan A" onChange={event => setGroupTitle(event.target.value)} /></label>
        <PlacementEditorProvider>
          <div className={styles.groupText}><div className={styles.sharedToolbar}><PlacementEditorToolbar disabled={busy} /></div><PlacementTextEditor shared disabled={busy} label="Teks bacaan grup" value={groupBody} onChange={setGroupBody} /></div>
        </PlacementEditorProvider>
        <label className={`admin-field ${styles.groupCount}`}>Jumlah soal awal<input required type="number" min="1" step="1" value={groupCount} onChange={event => setGroupCount(event.target.value)} /><small className={styles.linkedHint}>Soal baru otomatis terhubung ke bacaan ini.</small></label>
        {issue && <p role="alert">{issue}</p>}
      </form>
    </AdminDialog>
    <AdminDialog open={remove !== null} title={remove === "group" ? "Hapus grup bacaan?" : "Hapus soal?"} close={() => setRemove(null)} actions={<><button type="button" className="button" onClick={() => setRemove(null)}>Kembali</button><button type="button" className="button button-primary" disabled={busy} onClick={() => { onChange({ ...draft, passages: remove === "group" ? draft.passages?.filter(item => item.id !== passage?.id) : draft.passages, questions: draft.questions.filter(question => remove === "group" ? question.passageId !== passage?.id : question.id !== active?.id) }); setActiveId(""); setRemove(null); }}>Hapus dari Editor</button></>}><p>{remove === "group" ? `${linked.length} soal terkait ikut dihapus. ` : ""}Perubahan permanen setelah Simpan {title}. {!readingOnly && "Attempt siswa yang sudah dimulai tetap memakai snapshot lama."}</p></AdminDialog>
  </section>;
}
