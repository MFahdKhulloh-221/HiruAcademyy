"use client";

import { useEffect, useState } from "react";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { AdminDialog, AdminTabs } from "@/components/admin-primitives";
import { PlacementRichText, PlacementTextEditor } from "@/components/placement-rich-text";
import { assessmentLetters, assessmentQuestionError, orderedAssessmentQuestions, type AdminAssessment, type AdminAssessmentQuestion } from "@/components/admin-assessment-fixtures";
import { placementText } from "@/lib/placement-rich-text";
import { adminMediaUrl } from "@/lib/admin-media";
import placement from "./admin-placement-builder.module.css";
import styles from "./admin-tryout-builder.module.css";
import "./assessment-layout.css";

const sections = ["Kosakata & Kanji", "Audio / Choukai", "Reading / Dokkai", "Tata Bahasa"];
const labels = ["Kosakata & Kanji", "Choukai", "Dokkai", "Tata Bahasa"];

export function AdminTryoutQuestionBuilder({ draft, initialQuestion, onDirtyChange, busy, error, onChange, onSave, onClose, onDelete }: {
  draft: AdminAssessment; initialQuestion: AdminAssessmentQuestion | null; busy: boolean; error: string;
  onChange: (draft: AdminAssessment) => void; onSave: (draft: AdminAssessment) => Promise<void>; onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onDelete: (question: AdminAssessmentQuestion) => Promise<void>;
}) {
  const [section, setSection] = useState(initialQuestion?.section ?? sections[0]);
  const [active, setActive] = useState<AdminAssessmentQuestion | null>(initialQuestion ?? orderedAssessmentQuestions(draft)[0] ?? null);
  const [baseline, setBaseline] = useState(JSON.stringify(initialQuestion ?? orderedAssessmentQuestions(draft)[0] ?? null));
  const [working, setWorking] = useState<Record<string, AdminAssessmentQuestion>>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(false);
  const [previewAnswer, setPreviewAnswer] = useState<number | null>(null);
  const [issue, setIssue] = useState("");
  const [confirmation, setConfirmation] = useState<{ message: string; resolve: (confirmed: boolean) => void } | null>(null);
  function confirmAction(message: string): Promise<boolean> { return new Promise(resolve => setConfirmation({ message, resolve })); }
  function answerConfirmation(confirmed: boolean) { confirmation?.resolve(confirmed); setConfirmation(null); }
  const dirty = JSON.stringify(active) !== baseline;
  const buffered = active ? { ...working, [active.id]: active } : working;
  const questions = orderedAssessmentQuestions({ ...draft, questions: [...draft.questions.filter(question => !buffered[question.id]), ...Object.values(buffered)] }).filter(question => question.section === section);
  const filtered = questions.filter((question, index) => String(index + 1).includes(search.trim()) || placementText(question.prompt).toLowerCase().includes(search.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  useEffect(() => { onDirtyChange(dirty || Object.keys(working).length > 0); }, [dirty, working, onDirtyChange]);
  function rememberQuestion() {
    if (active && dirty) setWorking(current => ({ ...current, [active.id]: active }));
  }
  async function select(question: AdminAssessmentQuestion | null) {
    rememberQuestion();
    setActive(question ? { ...question, answers: [...question.answers] } : null);
    setBaseline(JSON.stringify(draft.questions.find(item => item.id === question?.id) ?? null)); setIssue(""); setPreview(false);
  }
  function stage(): AdminAssessment | null {
    if (!active) return draft;
    if (!Number.isSafeInteger(active.pointValue)) { setIssue("Soal baru belum memiliki konfigurasi penilaian. Hubungi pengelola untuk melengkapinya sebelum menyimpan."); return null; }
    const message = assessmentQuestionError({ ...active, prompt: placementText(active.prompt), answers: active.answers.map(placementText) }, draft);
    if (message) { setIssue(message); return null; }
    const merged = { ...working, [active.id]: active };
    const next = { ...draft, questions: [...draft.questions.filter(question => !merged[question.id]), ...Object.values(merged)] };
    setWorking({});
    onChange(next); setBaseline(JSON.stringify(active)); setIssue(""); return next;
  }
  async function add() {
    if (active) setWorking(current => ({ ...current, [active.id]: active }));
    const question: AdminAssessmentQuestion = { id: crypto.randomUUID(), section, type: section === sections[1] ? "Audio" : section === sections[2] ? "Reading" : "Multiple choice", prompt: "", answers: ["", "", "", ""], correctAnswer: -1, instruction: "", explanation: "", passage: "", file: null, order: String(questions.reduce((max, question) => Math.max(max, Number(question.order)), -1) + 1), status: "Draft" };
    setWorking(current => ({ ...current, ...(active ? { [active.id]: active } : {}), [question.id]: question }));
    setSearch(""); setPage(Math.ceil((questions.length + 1) / 10)); setActive(question); setBaseline("null"); setPreview(false); setIssue("");
  }
  const audio = adminMediaUrl(active?.audioUrl);
  return <div className={styles.questionBuilder}>
    <AdminTabs tabs={labels} active={labels[sections.indexOf(section)]} label="Bagian soal" onChange={label => { rememberQuestion(); setSection(sections[labels.indexOf(label)]); setSearch(""); setPage(1); setActive(null); setBaseline("null"); setPreview(false); }} />
    <p role="status">Isi soal ditahan otomatis selama builder terbuka. Klik Simpan Try Out agar perubahan tersimpan permanen.</p>
    {(issue || error) && <p role="alert">{issue || error}</p>}
    <div className={`${styles.twoPanels} ${active ? styles.editing : ""}`}>
      <aside className={styles.questionList} aria-label="Daftar soal">
        <label className="admin-field">Cari nomor atau isi soal<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
        <button type="button" className="button button-primary" disabled={busy} onClick={add}>+ Tambah Soal</button>
        <ol start={(currentPage - 1) * 10 + 1}>{filtered.slice((currentPage - 1) * 10, currentPage * 10).map(question => <li key={question.id}><button type="button" aria-current={active?.id === question.id ? "step" : undefined} onClick={() => select(question)}><strong>Soal {questions.findIndex(item => item.id === question.id) + 1}</strong><span className={styles.summary}>{placementText(question.prompt)}</span></button></li>)}</ol>
        <p>{filtered.length} soal · Halaman {currentPage} / {pages}</p>
        <div className={placement.actions}><button type="button" className="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Sebelumnya</button><button type="button" className="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Berikutnya</button></div>
      </aside>
      <section className={styles.questionEditor} aria-label="Editor soal">
        {active ? <form className={`${placement.form} ${styles.form}`} onSubmit={event => { event.preventDefault(); stage(); }}>
          <button type="button" className={`button ${styles.backToList}`} onClick={() => select(null)}>Kembali ke daftar soal</button>
          <h3 className={styles.questionTitle}>Soal {Math.max(1, questions.findIndex(question => question.id === active.id) + 1)} - {section === sections[1] ? "Choukai" : section === sections[2] ? "Dokkai" : section}</h3>
          <fieldset className={placement.fields} disabled={busy}>
            {active.type === "Audio" && <div className={placement.media}><AdminMediaUpload kind="audio" onUploaded={audioUrl => setActive({ ...active, audioUrl, file: null })} /><label className="admin-field">URL audio<input value={active.audioUrl ?? ""} onChange={event => setActive({ ...active, audioUrl: event.target.value })} /></label>{audio && <audio controls src={audio} preload="metadata" />}</div>}
            {active.type === "Reading" && <PlacementTextEditor label="Teks bacaan" value={active.passage} onChange={passage => setActive({ ...active, passage })} />}
            <PlacementTextEditor label="Pertanyaan" value={active.prompt} onChange={prompt => setActive({ ...active, prompt })} />
            <div className={styles.answerGrid}>{assessmentLetters.map((letter, index) => <div key={letter} className={styles.answer}><PlacementTextEditor label={`Pilihan ${letter}`} value={active.answers[index]} onChange={value => setActive({ ...active, answers: active.answers.map((answer, position) => position === index ? value : answer) })} /></div>)}</div>
            <label className="admin-field">Jawaban benar<select value={active.correctAnswer} onChange={event => setActive({ ...active, correctAnswer: Number(event.target.value) })}><option value={-1}>Pilih jawaban benar</option>{assessmentLetters.map((letter, index) => <option key={letter} value={index}>{letter}</option>)}</select></label>
            <details><summary>Penjelasan jawaban (opsional)</summary><PlacementTextEditor label="Penjelasan jawaban" value={active.explanation} onChange={explanation => setActive({ ...active, explanation })} /></details>

          </fieldset>
          <div className={placement.actions}><button type="button" className="button" onClick={() => { setPreviewAnswer(null); setPreview(!preview); }}>Pratinjau Siswa</button><button type="submit" className="button button-primary" disabled={busy}>Terapkan Perubahan Soal</button><button type="button" className="button" disabled={busy || !questions.some(question => question.id === active.id) || questions.findIndex(question => question.id === active.id) >= questions.length - 1} onClick={() => select(questions[questions.findIndex(question => question.id === active.id) + 1])}>Soal Berikutnya</button><button type="button" className="button" disabled={busy} onClick={async () => { if (!await confirmAction("Hapus soal ini? Soal yang sudah disimpan juga akan dihapus.")) return; try { await onDelete(active); setActive(null); setBaseline("null"); } catch (cause) { setIssue(cause instanceof Error ? cause.message : "Gagal menghapus soal."); } }}>Hapus Soal</button></div>
          {preview && <section className={`tryout-runner-polished ${styles.studentPreview}`} aria-label="Pratinjau Siswa">
            <header><h3>Pratinjau Siswa</h3><p>{draft.title}</p></header>
            {active.type === "Reading" && <section className="reading-passage" aria-label="Teks bacaan" tabIndex={0}>{active.instruction && <p className="reading-instruction"><PlacementRichText value={active.instruction} /></p>}<PlacementRichText value={active.passage} /></section>}
            <section className="learning-question-card">
              <p className="dash-kicker"><span>{labels[sections.indexOf(section)]}</span><span>Soal {Math.max(1, questions.findIndex(question => question.id === active.id) + 1)}</span></p>
              {audio && <audio controls src={audio} aria-label="Audio soal" />}
              {active.type !== "Reading" && active.instruction && <p><PlacementRichText value={active.instruction} /></p>}
              <h2><PlacementRichText value={active.prompt} /></h2>
              {active.japanese?.text && <p lang="ja"><ruby>{active.japanese.text}{active.japanese.reading && <rt>{active.japanese.reading}</rt>}</ruby></p>}
              <fieldset><legend className="sr-only">Pilihan jawaban pratinjau</legend>{active.answers.map((answer, index) => <label key={index} className={previewAnswer === index ? "selected" : ""}><input type="radio" name={`preview-answer-${active.id}`} checked={previewAnswer === index} onChange={() => setPreviewAnswer(index)} /><span className="tryout-option-letter">{assessmentLetters[index]}.</span><span className="tryout-option-text"><PlacementRichText value={answer} /></span></label>)}</fieldset>
            </section>
            <button type="button" className="button" onClick={() => setPreview(false)}>Tutup Pratinjau</button>
          </section>}

        </form> : <p>Pilih soal dari daftar atau tambah soal baru.</p>}
      </section>
    </div>
    <div className={`${placement.actions} ${styles.serverActions}`}><button type="button" className="button" disabled={busy} onClick={onClose}>Tutup Builder</button><button type="button" className="button button-primary" disabled={busy} onClick={async () => { const next = stage(); if (next) await onSave(next); }}>{busy ? "Menyimpan…" : "Simpan Try Out"}</button></div>
    <AdminDialog open={Boolean(confirmation)} title="Konfirmasi" close={() => answerConfirmation(false)} actions={<><button type="button" className="button" onClick={() => answerConfirmation(false)}>Batal</button><button type="button" className="button button-primary" onClick={() => answerConfirmation(true)}>Lanjutkan</button></>}><p>{confirmation?.message}</p></AdminDialog>
  </div>;
}
