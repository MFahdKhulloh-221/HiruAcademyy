"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiBookOpen, FiCheckCircle, FiEdit3, FiHeadphones, FiType } from "react-icons/fi";
import { StudentNavigation } from "@/components/student-navigation";
import { StudentTopbar } from "@/components/student-topbar";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { AssessmentContent } from "@/components/assessment-content";
import { AssessmentPassageContent } from "@/components/assessment-passage-content";
import { PlacementRichText } from "@/components/placement-rich-text";
import { QuestionAudioPlayer } from "@/components/question-audio-player";
import type { LearningCatalog } from "@/components/learning-hooks";
import type { Membership } from "@/lib/dashboard-mock";
import { contentMedia } from "@/lib/public-content-api";
import { dailyPractices, dailyPractice, dailyPracticeAttempt, dailyPracticeReview, dailyPracticeCategories, DailyPracticePersistence, sameDailyAnswers, type DailyPractice, type DailyPracticeAttempt } from "@/lib/student-daily-practice-api";
import styles from "./student-daily-practice.module.css";

const statusLabels = { open: "Belum dikerjakan", in_progress: "Sedang dikerjakan", completed: "Selesai" };
const errorMessage = (_error: unknown) => "Permintaan belum berhasil. Periksa koneksi, lalu coba lagi.";

export function PracticeScreen({ membership, resolvedCatalog }: { membership: Membership; resolvedCatalog?: LearningCatalog }) {
  void resolvedCatalog;
  const [category, setCategory] = useState("all");
  const [level, setLevel] = useState("all");
  const [items, setItems] = useState<DailyPractice[]>();
  const [error, setError] = useState("");
  const [submitFailed, setSubmitFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [restoreRevision, setRestoreRevision] = useState(0);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [selected, setSelected] = useState<DailyPractice>();
  const [attempt, setAttempt] = useState<DailyPracticeAttempt>();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const latestAnswers = useRef(answers);
  const persistence = useRef<DailyPracticePersistence | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [review, setReview] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [confirmation, setConfirmation] = useState<"submit" | "leave" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opening = useRef(false);
  const questionHeading = useRef<HTMLDivElement>(null);
  useEffect(() => { if (confirmation) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmation]);
  useEffect(() => { questionHeading.current?.focus(); }, [activeQuestion]);
  const unsaved = Boolean(attempt && !sameDailyAnswers(answers, attempt.answers));

  useEffect(() => {
    const controller = new AbortController();
    dailyPractices(controller.signal).then(data => { setItems(data); }).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (selected || unsaved) return;
    const refresh = () => { if (document.visibilityState === "visible") setReload(value => value + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [selected, unsaved]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("practice"));
    if (!Number.isSafeInteger(id) || id < 1) return;
    const controller = new AbortController();
    dailyPractice(id, controller.signal).then(async item => {
      const data = ["in_progress", "completed"].includes(item.status) ? await dailyPracticeAttempt(id, false, controller.signal) : undefined;
      if (controller.signal.aborted) return;
      setSelected(data ? item : undefined); setAttempt(data);
      if (data) {
        setAnswers(data.answers); latestAnswers.current = data.answers;
        persistence.current = new DailyPracticePersistence(data);
      } else {
        setAnswers({}); latestAnswers.current = {}; persistence.current = null;
      }
      setRestoreFailed(false); setError("");
    }).catch(error => { if (!controller.signal.aborted) { setRestoreFailed(true); setError(errorMessage(error)); } });
    return () => controller.abort();
  }, [restoreRevision]);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const accept = useCallback((data: DailyPracticeAttempt) => {
    setAttempt(data);
    // Local edits remain authoritative until exact snapshot acknowledged. Never replace newer answers.
  }, []);

  async function open(item: DailyPractice, reviewing = false) {
    if (opening.current) return;
    opening.current = true; setBusy(true); setError("");
    try {
      const fresh = await dailyPractice(item.id);
      const data = reviewing ? await dailyPracticeReview(item.id) : await dailyPracticeAttempt(item.id, fresh.status === "open");
      setSelected(fresh); setAttempt(data); setActiveQuestion(0);
      setAnswers(data.answers); latestAnswers.current = data.answers;
      persistence.current = new DailyPracticePersistence(data);
      setReview(reviewing); setSaveError(""); setSubmitFailed(false);
      const url = new URL(window.location.href); url.searchParams.set("practice", String(item.id)); window.history.replaceState(null, "", url);
    } catch (error) { setError(errorMessage(error)); }
    finally { opening.current = false; setBusy(false); }
  }

  async function save(snapshot: Record<string, string>, retry = false) {
    const current = persistence.current;
    if (!current) return;
    setSaving(value => value + 1);
    try { accept(await current.save(snapshot, retry)); setSaveError(""); }
    catch (error) { setSaveError(errorMessage(error)); }
    finally { setSaving(value => value - 1); }
  }

  function choose(id: number, answer: string) {
    const next = { ...latestAnswers.current, [id]: answer };
    latestAnswers.current = next; setAnswers(next); void save(next);
  }

  async function submit() {
    if (!persistence.current || busy || saveError) return;
    setBusy(true); setError(""); setSubmitFailed(false);
    try { accept(await persistence.current.submit(latestAnswers.current)); }
    catch (error) { setSubmitFailed(true); setError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function back(confirmed = false) {
    if (unsaved && !confirmed) { setConfirmation("leave"); return; }
    setSelected(undefined); setAttempt(undefined); persistence.current = null; setReview(false); setSaveError(""); setError(""); setSubmitFailed(false); setReload(value => value + 1);
    const url = new URL(window.location.href); url.searchParams.delete("practice"); window.history.replaceState(null, "", url);
  }

  const filtered = (items ?? []).filter(item => (category === "all" || item.category === category) && (level === "all" || item.target_level === level));
  const completed = attempt?.status === "completed";
  const canReview = completed && selected?.can_review === true;
  const selectedId = selected?.id;
  useEffect(() => {
    if (!completed || !selectedId) return;
    const controller = new AbortController();
    dailyPractice(selectedId, controller.signal).then(item => { if (!controller.signal.aborted) setSelected(item); }).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => controller.abort();
  }, [completed, selectedId]);
  const answeredCount = attempt?.questions.filter(question => answers[question.id]).length ?? 0;
  const unansweredCount = (attempt?.questions.length ?? 0) - answeredCount;
  const categoryIcons = { vocabulary: FiType, grammar: FiEdit3, reading: FiBookOpen, audio: FiHeadphones };

  return <div className="supporting-shell student-shell">
    <StudentNavigation membership={membership} />
    <div className="supporting-body">
      <StudentTopbar membership={membership} />
    <main className={`supporting-main practice-page ${styles.page}`}>
      {!selected && <header><h1>Latihan Harian</h1><p>Tingkatkan kemampuan bahasa Jepang dengan latihan sesuai kategori pilihanmu. Kerjakan kapan saja tanpa batas waktu.</p></header>}
      {error && <div role="alert">{error} <button type="button" onClick={() => {
        if (submitFailed && selected && attempt?.status === "in_progress") void submit();
        else if (selected && !unsaved) void open(selected, review);
        else if (restoreFailed) setRestoreRevision(value => value + 1);
        else { setError(""); setReload(value => value + 1); }
      }}>Coba Lagi</button></div>}
      {selected && attempt ? <section aria-label="Pengerjaan latihan" className={styles.runner}>
        {completed && attempt.result && <section className={styles.result} aria-label="Hasil latihan">
          <header className={styles.resultHeader}><span className={styles.resultIcon} aria-hidden="true"><FiCheckCircle /></span><div><div className={styles.resultHeading}><h2>Hasil Latihan</h2><span className={styles.badge} data-status="completed">Selesai</span></div><p>{selected.title}</p><span className={styles.resultMeta}>{dailyPracticeCategories[selected.category]} · {selected.target_level.toUpperCase()} · {attempt.questions.length} soal</span></div></header>
          <div className={styles.resultSummary}><div className={styles.resultScore}><span>Jawaban benar</span><p><strong>{attempt.result.correct}</strong><span> / {attempt.result.correct + attempt.result.wrong + attempt.result.unanswered} soal</span></p><small>Jawabanmu sudah dikumpulkan.</small></div>
            <dl className={styles.resultStats}><div data-outcome="correct"><dt>Benar</dt><dd>{attempt.result.correct}</dd></div><div data-outcome="wrong"><dt>Salah</dt><dd>{attempt.result.wrong}</dd></div><div data-outcome="blank"><dt>Tidak dijawab</dt><dd>{attempt.result.unanswered}</dd></div></dl>
          </div>
          <footer className={styles.resultFooter}><p>{review ? "Pelajari jawaban dan penjelasan pada setiap soal di bawah." : "Lihat pembahasan untuk memahami jawaban dan belajar dari latihan ini."}</p><div className={styles.resultActions}><button type="button" className="button" disabled={busy} onClick={() => back()}><FiArrowLeft aria-hidden="true" /> Kembali ke Daftar Latihan</button>{!review && <button type="button" className="button button-primary" disabled={!canReview || busy} onClick={() => void open(selected, true)}><FiBookOpen aria-hidden="true" /> {busy ? "Memuat…" : "Lihat Pembahasan"}</button>}</div></footer>
        </section>}
        {saveError && <div role="alert">Jawaban belum tersimpan. {saveError} <button type="button" disabled={busy || saving > 0 || completed} onClick={() => void save(latestAnswers.current, true)}>Coba Simpan Lagi</button></div>}
        <div className={styles.workspace}><div className={styles.questionColumn}>
        {(!completed || review) && attempt.questions.map((question, index) => index === activeQuestion && <article className={styles.question} key={question.id}>
          <div ref={questionHeading} tabIndex={-1} className={styles.questionTitle}>Soal {index + 1} dari {attempt.questions.length}</div>
          {(question.passage || question.reading_passage) && <section className={styles.passage} aria-label="Teks bacaan"><h3><FiBookOpen aria-hidden="true" /> Teks Reading</h3><div>{question.passage ? <AssessmentPassageContent passage={question.passage} /> : <PlacementRichText value={question.reading_passage!} />}</div></section>}
          {question.instruction && <PlacementRichText value={question.instruction} />}
          {question.audio_url && <QuestionAudioPlayer key={`${attempt.id}:${question.id}`} endpoint={`/api/assessment-audio/daily-practice/${attempt.id}/${question.id}`} src={contentMedia(question.audio_url, question.audio_url_resolved_url) ?? ""} disabled={completed} />}
          {question.japanese && <p lang="ja"><ruby>{question.japanese.text}<rt>{question.japanese.reading}</rt></ruby></p>}
          <AssessmentContent content={question}><h3 id={`daily-question-${question.id}`}>{index + 1}. <PlacementRichText value={question.question ?? question.prompt ?? ""} /></h3></AssessmentContent>
          <fieldset className={styles.options} disabled={completed || busy} aria-labelledby={`daily-question-${question.id}`}>
            <legend className="sr-only">Pilihan jawaban soal {index + 1}</legend>
            {Object.entries(question.options).map(([letter, text]) => <label key={letter}><input type="radio" name={`daily-${question.id}`} value={letter} checked={answers[question.id] === letter} onChange={() => choose(question.id, letter)} /><span>{letter}. <PlacementRichText value={text} /></span></label>)}
          </fieldset>
          {review && <div className={styles.explanation}><p>Jawaban kamu: {answers[question.id] ?? "Belum dijawab"}</p>{question.correct_option && <p>Jawaban benar: {question.correct_option}</p>}{question.explanation && <PlacementRichText value={question.explanation} />}</div>}
        </article>)}
        {(!completed || review) && <div className={styles.runnerActions}><button type="button" className="button" disabled={activeQuestion === 0 || busy} onClick={() => setActiveQuestion(value => value - 1)}>Sebelumnya</button>{activeQuestion < attempt.questions.length - 1 ? <button type="button" className="button button-primary" disabled={busy} onClick={() => setActiveQuestion(value => value + 1)}>Selanjutnya</button> : !completed && <button type="button" className="button button-primary" disabled={busy || Boolean(saveError)} onClick={() => setConfirmation("submit")}>{busy ? "Mengumpulkan…" : "Kumpulkan Jawaban"}</button>}</div>}
        </div>{(!completed || review) && <aside className={styles.navigator} aria-label="Navigasi latihan"><h3>Navigasi Soal</h3><nav className={styles.questionNav} aria-label="Navigasi soal">{attempt.questions.map((question, index) => <button type="button" key={question.id} aria-current={activeQuestion === index ? "step" : undefined} aria-label={`Soal ${index + 1}, ${answers[question.id] ? "terjawab" : "belum dijawab"}`} data-answered={Boolean(answers[question.id])} onClick={() => setActiveQuestion(index)}>{index + 1}</button>)}</nav></aside>}</div>
      </section> : <>
        <section className={styles.categories} aria-label="Kategori latihan">{Object.entries(dailyPracticeCategories).map(([key, label]) => {
          const Icon = categoryIcons[key as keyof typeof categoryIcons];
          const count = items?.filter(item => item.category === key).length;
          return <button type="button" key={key} className={styles.categoryCard} aria-pressed={category === key} onClick={() => setCategory(key)}><span className={styles.categoryIcon} aria-hidden="true"><Icon /></span><strong>{label}</strong><span>{count === undefined ? "Memuat…" : `${count} paket latihan`}</span></button>;
        })}</section>
        <div className={styles.filters}>
          <button type="button" className="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>Semua Latihan</button>
          <label>Filter Level<select value={level} onChange={event => setLevel(event.target.value)}><option value="all">Semua Level</option>{[...new Set((items ?? []).map(item => item.target_level))].sort().map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
        </div>
        {!items && !error && <LoadingSkeleton variant="cards" label="Memuat latihan…" />}
        {items && !filtered.length && !error && <section className={styles.emptyMain} aria-label="Informasi daftar kosong">
          <span className={styles.emptyIllustration} aria-hidden="true"><FiBookOpen /></span>
          <div role="status"><h2>Belum ada latihan tersedia</h2><p>Latihan untuk kategori ini belum tersedia. Kamu dapat memilih kategori lainnya.</p></div>
          {(category !== "all" || level !== "all") && <button type="button" className="button button-primary" onClick={() => { setCategory("all"); setLevel("all"); }}>Reset Filter</button>}
        </section>}
        {items && <p className={styles.count}>{filtered.length} latihan</p>}
        <section className={styles.list} aria-label="Daftar latihan harian">{filtered.map(item => { const Icon = categoryIcons[item.category]; return <article key={item.id} className={styles.card}>
          <span className={styles.categoryIcon} aria-hidden="true"><Icon /></span><div className={styles.cardInfo}><h2>{item.title}</h2><p>{dailyPracticeCategories[item.category]} · Target {item.target_level.toUpperCase()} · {item.question_count} soal</p></div>
          <span className={styles.badge} data-status={item.status}>{statusLabels[item.status]}</span>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void open(item)}>{item.status === "open" ? "Mulai Latihan" : item.status === "in_progress" ? "Lanjutkan Latihan" : "Lihat Hasil"}<span className="sr-only"> {item.title}</span></button>
        </article>; })}</section>
      </>}
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="daily-confirm-title" aria-describedby="daily-confirm-description" onCancel={() => setConfirmation(null)}>
        <h2 id="daily-confirm-title">{confirmation === "leave" ? "Tinggalkan latihan?" : "Kumpulkan jawaban?"}</h2>
        <p id="daily-confirm-description">{confirmation === "leave" ? "Ada jawaban belum tersimpan. Jika keluar, perubahan tersebut dapat hilang." : `${unansweredCount} soal belum dijawab. Setelah dikumpulkan, jawaban tidak dapat diubah dan latihan tidak dapat diulang.`}</p>
        <div className={styles.runnerActions}><button type="button" className="button" autoFocus onClick={() => setConfirmation(null)}>Batal</button><button type="button" className="button button-primary" disabled={busy} onClick={() => { const action = confirmation; setConfirmation(null); if (action === "leave") back(true); else void submit(); }}>{confirmation === "leave" ? "Tinggalkan Latihan" : "Ya, Kumpulkan"}</button></div>
      </dialog>
    </main>
    </div>
  </div>;
}
