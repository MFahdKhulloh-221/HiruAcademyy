"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StudentNavigation } from "@/components/student-navigation";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { AssessmentContent } from "@/components/assessment-content";
import { AssessmentPassageContent } from "@/components/assessment-passage-content";
import { PlacementRichText } from "@/components/placement-rich-text";
import type { LearningCatalog } from "@/components/learning-hooks";
import type { Membership } from "@/lib/dashboard-mock";
import { contentMedia } from "@/lib/public-content-api";
import { dailyPractices, dailyPractice, dailyPracticeAttempt, dailyPracticeReview, dailyPracticeCategories, DailyPracticePersistence, sameDailyAnswers, wibDate, type DailyPractice, type DailyPracticeAttempt } from "@/lib/student-daily-practice-api";
import styles from "./student-daily-practice.module.css";

const statusLabels = { upcoming: "Belum dibuka", open: "Terbuka", in_progress: "Dalam pengerjaan", completed: "Selesai", closed: "Ditutup" };
const schedule = (value: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Permintaan belum berhasil. Coba lagi.";

export function PracticeScreen({ membership, resolvedCatalog }: { membership: Membership; resolvedCatalog?: LearningCatalog }) {
  void resolvedCatalog;
  const [date, setDate] = useState(() => wibDate());
  const [category, setCategory] = useState("all");
  const [level, setLevel] = useState("all");
  const [items, setItems] = useState<DailyPractice[]>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [restoreRevision, setRestoreRevision] = useState(0);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const serverClock = useRef<{ time: number; received: number } | null>(null);
  const [selected, setSelected] = useState<DailyPractice>();
  const [attempt, setAttempt] = useState<DailyPracticeAttempt>();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const latestAnswers = useRef(answers);
  const persistence = useRef<DailyPracticePersistence | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [review, setReview] = useState(false);
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(serverClock.current ? serverClock.current.time + performance.now() - serverClock.current.received : Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const unsaved = Boolean(attempt && !sameDailyAnswers(answers, attempt.answers));

  useEffect(() => {
    const controller = new AbortController();
    dailyPractices(date, controller.signal).then(data => { setItems(data); }).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => controller.abort();
  }, [date, reload]);

  useEffect(() => {
    if (selected || unsaved) return;
    const refresh = () => { if (document.visibilityState === "visible") setReload(value => value + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, [selected, unsaved]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("practice"));
    if (!Number.isSafeInteger(id) || id < 1) return;
    const controller = new AbortController();
    Promise.all([dailyPractice(id, controller.signal), dailyPracticeAttempt(id, false, controller.signal)]).then(([item, data]) => {
      setSelected(item); setAttempt(data); setAnswers(data.answers); latestAnswers.current = data.answers;
      persistence.current = new DailyPracticePersistence(data);
      serverClock.current = data.server_now ? { time: Date.parse(data.server_now), received: performance.now() } : null;
      if (data.server_now) setNow(Date.parse(data.server_now));
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

  // Server finalizes expired attempts. Browser only reads; never submits unsaved data on expiry.
  useEffect(() => {
    if (!attempt || !selected || attempt.status === "completed") return;
    const started = performance.now();
    const remaining = Date.parse(selected.ends_at) - Date.parse(attempt.server_now ?? new Date().toISOString());
    let pending = false;
    const controller = new AbortController();
    const check = async () => {
      if (performance.now() - started < remaining || pending) return;
      setExpired(true); pending = true;
      try {
        const data = await dailyPracticeAttempt(selected.id, false, controller.signal);
        if (!controller.signal.aborted) { setAttempt(data); if (persistence.current) persistence.current.attempt = data; }
      } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
      finally { pending = false; }
    };
    const timer = window.setInterval(() => void check(), 1000);
    void check();
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [attempt, selected]);

  const accept = useCallback((data: DailyPracticeAttempt) => {
    setAttempt(data);
    serverClock.current = data.server_now ? { time: Date.parse(data.server_now), received: performance.now() } : null;
    if (data.server_now) setNow(Date.parse(data.server_now));
    // Local edits remain authoritative until exact snapshot acknowledged. Never replace newer answers.
  }, []);

  async function open(item: DailyPractice, reviewing = false) {
    setBusy(true); setError("");
    try {
      const data = reviewing ? await dailyPracticeReview(item.id) : await dailyPracticeAttempt(item.id, item.status === "open");
      setSelected(item); setAttempt(data); setAnswers(data.answers); latestAnswers.current = data.answers;
      serverClock.current = data.server_now ? { time: Date.parse(data.server_now), received: performance.now() } : null;
      if (data.server_now) setNow(Date.parse(data.server_now));
      persistence.current = new DailyPracticePersistence(data); setReview(reviewing); setSaveError(""); setExpired(false);
      const url = new URL(window.location.href); url.searchParams.set("practice", String(item.id)); window.history.replaceState(null, "", url);
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
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
    setBusy(true); setError("");
    try { accept(await persistence.current.submit(latestAnswers.current)); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function back() {
    if (unsaved && !window.confirm("Ada jawaban belum tersimpan. Tinggalkan latihan?")) return;
    setSelected(undefined); setAttempt(undefined); persistence.current = null; setReview(false); setSaveError(""); setError(""); setReload(value => value + 1);
    const url = new URL(window.location.href); url.searchParams.delete("practice"); window.history.replaceState(null, "", url);
  }

  const filtered = (items ?? []).filter(item => (category === "all" || item.category === category) && (level === "all" || item.target_level === level)).sort((a, b) => {
    const priority = (item: DailyPractice) => ["open", "in_progress"].includes(item.status) ? 0 : 1;
    return priority(a) - priority(b) || Date.parse(a.ends_at) - Date.parse(b.ends_at);
  });
  const completed = attempt?.status === "completed";
  const canReview = selected && (selected.can_review === true || Date.parse(selected.ends_at) <= now);

  return <div className="supporting-shell student-shell">
    <StudentNavigation membership={membership} />
    <main className={`supporting-main practice-page ${styles.page}`}>
      <header><h1>Latihan Harian</h1><p>Latihan untuk semua member, termasuk Free. Level adalah label target, bukan batas akses.</p></header>
      {error && <div role="alert">{error} <button type="button" onClick={() => {
        if (selected && attempt?.status === "in_progress") void submit();
        else if (selected && !unsaved) void open(selected, review);
        else if (restoreFailed) setRestoreRevision(value => value + 1);
        else { setError(""); setReload(value => value + 1); }
      }}>Coba Lagi</button></div>}
      {selected && attempt ? <section aria-label="Pengerjaan latihan" className={styles.runner}>
        <button type="button" className="button" disabled={busy || saving > 0} onClick={back}>Kembali ke Daftar Latihan</button>
        <h2>{selected.title}</h2>
        <p>{dailyPracticeCategories[selected.category]} · Target {selected.target_level.toUpperCase()}</p>
        <p>Jadwal: {schedule(selected.starts_at)} – {schedule(selected.ends_at)} WIB</p>
        <p>Batas pengumpulan: {schedule(selected.ends_at)} WIB. Satu kesempatan; lanjutkan pengerjaan yang sama.</p>
        {completed && attempt.result && <section className={styles.result} aria-label="Hasil latihan"><h3>Hasil Latihan</h3><p>Skor: {attempt.result.earned ?? attempt.result.percentage ?? 0}{attempt.result.max != null ? ` / ${attempt.result.max}` : ""}</p><p>{attempt.result.correct} benar · {attempt.result.wrong} salah · {attempt.result.unanswered} belum dijawab</p></section>}
        {completed && !review && <><p>Kunci jawaban dan pembahasan hanya tersedia setelah jadwal berakhir.</p><button type="button" className="button" disabled={!canReview || busy} onClick={() => void open(selected, true)}>Lihat Pembahasan</button></>}
        {expired && <p role="status">Jadwal berakhir. Server menutup latihan; jawaban yang belum tersimpan tidak dikirim otomatis.</p>}
        {saveError && <div role="alert">Jawaban belum tersimpan. {saveError} <button type="button" disabled={busy || saving > 0 || expired || completed} onClick={() => void save(latestAnswers.current, true)}>Coba Simpan Lagi</button></div>}
        {!completed && <p role="status">{saving > 0 ? "Menyimpan jawaban…" : unsaved ? "Ada jawaban belum tersimpan." : "Semua jawaban tersimpan."}</p>}
        {(!completed || review) && attempt.questions.map((question, index) => <article className={styles.question} key={question.id}>
          {question.passage && <AssessmentPassageContent passage={question.passage} />}
          {!question.passage && question.reading_passage && <PlacementRichText value={question.reading_passage} />}
          {question.instruction && <PlacementRichText value={question.instruction} />}
          {question.audio_url && <audio controls preload="none" src={contentMedia(question.audio_url, question.audio_url_resolved_url)} aria-label={`Audio soal ${index + 1}`} />}
          {question.japanese && <p lang="ja"><ruby>{question.japanese.text}<rt>{question.japanese.reading}</rt></ruby></p>}
          <AssessmentContent content={question}><h3 id={`daily-question-${question.id}`}>{index + 1}. <PlacementRichText value={question.question ?? question.prompt ?? ""} /></h3></AssessmentContent>
          <fieldset className={styles.options} disabled={completed || busy || expired} aria-labelledby={`daily-question-${question.id}`}>
            <legend className="sr-only">Pilihan jawaban soal {index + 1}</legend>
            {Object.entries(question.options).map(([letter, text]) => <label key={letter}><input type="radio" name={`daily-${question.id}`} value={letter} checked={answers[question.id] === letter} onChange={() => choose(question.id, letter)} /><span>{letter}. <PlacementRichText value={text} /></span></label>)}
          </fieldset>
          {review && <div className={styles.explanation}><p>Jawaban benar: {question.correct_option}</p>{question.explanation && <PlacementRichText value={question.explanation} />}</div>}
        </article>)}
        {!completed && <button type="button" className="button button-primary" disabled={busy || expired || Boolean(saveError)} onClick={() => {
          const unanswered = attempt.questions.filter(question => !latestAnswers.current[question.id]).length;
          if (window.confirm(`${unanswered} soal belum dijawab. Kumpulkan jawaban sekarang? Setelah dikumpulkan, jawaban tidak dapat diubah dan latihan tidak dapat diulang.`)) void submit();
        }}>{busy ? "Mengumpulkan…" : "Kumpulkan Jawaban"}</button>}
      </section> : <>
        <div className={styles.filters}>
          <label>Tanggal (WIB)<input type="date" value={date} onChange={event => { if (event.target.value) { setDate(event.target.value); setItems(undefined); } }} /></label>
          <button type="button" className="button" onClick={() => { setDate(wibDate()); setReload(value => value + 1); }}>Hari Ini</button>
          <label>Kategori<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">Semua Kategori</option>{Object.entries(dailyPracticeCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Filter Level<select value={level} onChange={event => setLevel(event.target.value)}><option value="all">Semua Level</option>{[...new Set((items ?? []).map(item => item.target_level))].sort().map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
        </div>
        <p>Arsip: pilih tanggal sebelumnya untuk melihat hasil dan pembahasan latihan yang sudah selesai.</p>
        {!items && !error && <LoadingSkeleton variant="cards" label="Memuat latihan…" />}
        {items && !filtered.length && <p role="status">Belum ada latihan untuk tanggal dan filter ini.</p>}
        <section className={styles.list} aria-label="Daftar latihan harian">{filtered.map(item => <article key={item.id} className={styles.card}>
          <span className={styles.badge}>{statusLabels[item.status]}</span><h2>{item.title}</h2>
          <p>{dailyPracticeCategories[item.category]} · Target {item.target_level.toUpperCase()} · {item.question_count} soal</p>
          <p>Jadwal: {schedule(item.starts_at)} – {schedule(item.ends_at)} WIB</p>
          <button type="button" className="button button-primary" disabled={busy || ["upcoming", "closed"].includes(item.status)} onClick={() => void open(item)}>{item.status === "completed" ? "Lihat Hasil" : item.status === "in_progress" ? "Lanjutkan Latihan" : item.status === "upcoming" ? "Belum Dibuka" : item.status === "closed" ? "Ditutup" : "Mulai Latihan"}</button>
        </article>)}</section>
      </>}
    </main>
  </div>;
}
