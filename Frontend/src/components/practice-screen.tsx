"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiBookOpen, FiCalendar, FiEdit3, FiHeadphones, FiType } from "react-icons/fi";
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
  const [submitFailed, setSubmitFailed] = useState(false);
  const [expiryError, setExpiryError] = useState("");
  const [expiryRevision, setExpiryRevision] = useState(0);
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
  const [detail, setDetail] = useState(false);
  const [archive, setArchive] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [confirmation, setConfirmation] = useState<"submit" | "leave" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opening = useRef(false);
  const dateInput = useRef<HTMLInputElement>(null);
  function chooseDate() {
    dateInput.current?.focus();
    try { dateInput.current?.showPicker(); } catch { /* Focus remains available when browser blocks picker. */ }
  }
  const questionHeading = useRef<HTMLDivElement>(null);
  useEffect(() => { if (confirmation) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmation]);
  useEffect(() => { questionHeading.current?.focus(); }, [activeQuestion]);
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
    dailyPractice(id, controller.signal).then(async item => {
      const data = ["in_progress", "completed"].includes(item.status) ? await dailyPracticeAttempt(id, false, controller.signal) : undefined;
      if (controller.signal.aborted) return;
      setSelected(item); setDetail(!data); setAttempt(data);
      if (data) {
        setAnswers(data.answers); latestAnswers.current = data.answers;
        persistence.current = new DailyPracticePersistence(data);
        serverClock.current = data.server_now ? { time: Date.parse(data.server_now), received: performance.now() } : null;
        if (data.server_now) setNow(Date.parse(data.server_now));
      } else {
        setAnswers({}); latestAnswers.current = {}; persistence.current = null; serverClock.current = null;
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
        if (!controller.signal.aborted) { setExpiryError(""); setAttempt(data); if (persistence.current) persistence.current.attempt = data; }
      } catch (error) { if (!controller.signal.aborted) setExpiryError(errorMessage(error)); }
      finally { pending = false; }
    };
    const timer = window.setInterval(() => void check(), 1000);
    void check();
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [attempt, selected, expiryRevision]);

  const accept = useCallback((data: DailyPracticeAttempt) => {
    setAttempt(data);
    serverClock.current = data.server_now ? { time: Date.parse(data.server_now), received: performance.now() } : null;
    if (data.server_now) setNow(Date.parse(data.server_now));
    // Local edits remain authoritative until exact snapshot acknowledged. Never replace newer answers.
  }, []);

  async function open(item: DailyPractice, reviewing = false, start = false) {
    if (opening.current) return;
    opening.current = true; setBusy(true); setError("");
    try {
      const fresh = await dailyPractice(item.id);
      const data = reviewing ? await dailyPracticeReview(item.id) : start || ["in_progress", "completed"].includes(fresh.status) ? await dailyPracticeAttempt(item.id, start && fresh.status === "open") : undefined;
      setSelected(fresh); setAttempt(data); setDetail(!data || (!start && !reviewing)); setActiveQuestion(0);
      if (data) {
        setAnswers(data.answers); latestAnswers.current = data.answers;
        serverClock.current = data.server_now ? { time: Date.parse(data.server_now), received: performance.now() } : null;
        if (data.server_now) setNow(Date.parse(data.server_now));
        persistence.current = new DailyPracticePersistence(data);
      } else {
        setAnswers({}); latestAnswers.current = {}; persistence.current = null; serverClock.current = null;
      }
      setReview(reviewing); setSaveError(""); setExpired(false); setExpiryError(""); setSubmitFailed(false);
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
    setSelected(undefined); setAttempt(undefined); persistence.current = null; setReview(false); setDetail(false); setSaveError(""); setError(""); setExpiryError(""); setSubmitFailed(false); setReload(value => value + 1);
    const url = new URL(window.location.href); url.searchParams.delete("practice"); window.history.replaceState(null, "", url);
  }

  const filtered = (items ?? []).filter(item => (category === "all" || item.category === category) && (level === "all" || item.target_level === level)).sort((a, b) => {
    const priority = (item: DailyPractice) => ["open", "in_progress"].includes(item.status) ? 0 : 1;
    return priority(a) - priority(b) || Date.parse(a.ends_at) - Date.parse(b.ends_at);
  });
  const filterEmpty = Boolean(items?.length && !filtered.length);
  const emptyToday = date === wibDate();
  const completed = attempt?.status === "completed";
  const canReview = selected?.can_review === true;
  const answeredCount = attempt?.questions.filter(question => answers[question.id]).length ?? 0;
  const unansweredCount = (attempt?.questions.length ?? 0) - answeredCount;
  const categoryIcons = { vocabulary: FiType, grammar: FiEdit3, reading: FiBookOpen, audio: FiHeadphones };
  const deadlineReached = Boolean(selected && Date.parse(selected.ends_at) <= now);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId || !deadlineReached || canReview) return;
    const controller = new AbortController();
    dailyPractice(selectedId, controller.signal).then(item => { if (!controller.signal.aborted) setSelected(item); }).catch(() => undefined);
    return () => controller.abort();
  }, [selectedId, canReview, deadlineReached]);

  return <div className="supporting-shell student-shell">
    <StudentNavigation membership={membership} />
    <div className="supporting-body">
      <StudentTopbar membership={membership} />
    <main className={`supporting-main practice-page ${styles.page}`}>
      <header><h1>Latihan Harian</h1><p>Latihan untuk semua member, termasuk Free. Level adalah label target, bukan batas akses.</p></header>
      {error && <div role="alert">{error} <button type="button" onClick={() => {
        if (submitFailed && !expired && selected && attempt?.status === "in_progress" && !detail) void submit();
        else if (selected && !unsaved) void open(selected, review);
        else if (restoreFailed) setRestoreRevision(value => value + 1);
        else { setError(""); setReload(value => value + 1); }
      }}>Coba Lagi</button></div>}
      {selected && detail ? <section aria-label="Detail latihan" className={styles.runner}>
        <button type="button" className="button" disabled={busy} onClick={() => back()}>Kembali ke Daftar Latihan</button>
        <div className={styles.detail}>
          <section className={styles.panel}><span className={styles.badge} data-status={selected.status}>{statusLabels[selected.status]}</span><h2>{selected.title}</h2><p>{dailyPracticeCategories[selected.category]} · Target {selected.target_level.toUpperCase()}</p><h3>Informasi Latihan</h3><p>{selected.question_count} soal · Terbuka untuk semua membership</p><p>Mulai: {schedule(selected.starts_at)} WIB</p><p>Berakhir: {schedule(selected.ends_at)} WIB</p><p>Satu kesempatan. Jawaban disimpan selama pengerjaan. Setelah dikumpulkan, jawaban tidak dapat diubah dan latihan tidak dapat diulang.</p></section>
          <aside className={styles.panel} aria-label="Ringkasan latihan"><h3>Ringkasan Pengerjaan</h3><p>Status: {completed ? "Selesai" : statusLabels[selected.status]}</p><p>{selected.question_count} soal</p><div className={styles.progress}><p>{attempt ? `${answeredCount} terjawab · ${unansweredCount} belum dijawab` : "Latihan belum dimulai."}</p><progress aria-label="Progres pengerjaan" value={answeredCount} max={(attempt?.questions.length ?? selected.question_count) || 1} /></div><p>{canReview ? "Pembahasan tersedia setelah latihan selesai." : "Pembahasan belum tersedia. Menunggu jadwal berakhir dan izin server."}</p>{attempt?.result && <p>Skor: {attempt.result.earned ?? attempt.result.percentage ?? 0}{attempt.result.max != null ? ` / ${attempt.result.max}` : ""}</p>}<p>Batas pengumpulan: {schedule(selected.ends_at)} WIB</p><button type="button" className="button button-primary" disabled={busy || ["upcoming", "closed"].includes(selected.status)} onClick={() => { if (attempt) setDetail(false); else void open(selected, false, true); }}>{busy ? "Memuat…" : selected.status === "completed" ? "Lihat Hasil" : selected.status === "in_progress" ? "Lanjutkan Latihan" : "Mulai Latihan"}</button></aside>
        </div>
      </section> : selected && attempt ? <section aria-label="Pengerjaan latihan" className={styles.runner}>
        <button type="button" className="button" disabled={busy || saving > 0} onClick={() => back()}>Kembali ke Daftar Latihan</button>
        <h2>{selected.title}</h2>
        <p>{dailyPracticeCategories[selected.category]} · Target {selected.target_level.toUpperCase()}</p>
        <p>Jadwal: {schedule(selected.starts_at)} – {schedule(selected.ends_at)} WIB</p>
        <p>Batas pengumpulan: {schedule(selected.ends_at)} WIB. Satu kesempatan; lanjutkan pengerjaan yang sama.</p>
        {completed && attempt.result && <section className={styles.result} aria-label="Hasil latihan"><span className={styles.badge} data-status="completed">Selesai</span><h3>Hasil Latihan</h3><p>Skor: {attempt.result.earned ?? attempt.result.percentage ?? 0}{attempt.result.max != null ? ` / ${attempt.result.max}` : ""}</p><p>{attempt.result.correct} benar · {attempt.result.wrong} salah · {attempt.result.unanswered} belum dijawab</p></section>}
        {completed && !review && <><p>Kunci jawaban dan pembahasan hanya tersedia setelah jadwal berakhir.</p><button type="button" className="button" disabled={!canReview || busy} onClick={() => void open(selected, true)}>Lihat Pembahasan</button></>}
        {expired && <p role="status">Jadwal berakhir. Server menutup latihan; jawaban yang belum tersimpan tidak dikirim otomatis.</p>}
        {expiryError && <div role="alert">Status penutupan belum terbaca. {expiryError} <button type="button" onClick={() => setExpiryRevision(value => value + 1)}>Coba Baca Status Lagi</button></div>}
        {saveError && <div role="alert">Jawaban belum tersimpan. {saveError} <button type="button" disabled={busy || saving > 0 || expired || completed} onClick={() => void save(latestAnswers.current, true)}>Coba Simpan Lagi</button></div>}
        {!completed && <p role="status">{saving > 0 ? "Menyimpan jawaban…" : unsaved ? "Ada jawaban belum tersimpan." : "Semua jawaban tersimpan."}</p>}
        {(!completed || review) && <><div className={styles.progress}><span>{answeredCount} dari {attempt.questions.length} soal terjawab</span><progress aria-label="Progres jawaban" value={answeredCount} max={attempt.questions.length || 1} /></div><nav className={styles.questionNav} aria-label="Navigasi soal">{attempt.questions.map((question, index) => <button type="button" key={question.id} aria-current={activeQuestion === index ? "step" : undefined} aria-label={`Soal ${index + 1}, ${answers[question.id] ? "terjawab" : "belum dijawab"}`} data-answered={Boolean(answers[question.id])} onClick={() => setActiveQuestion(index)}>{index + 1}</button>)}</nav><p className={styles.legend}>Nomor aktif: garis oranye · Terjawab: biru · Belum dijawab: putih</p></>}
        {(!completed || review) && attempt.questions.map((question, index) => index === activeQuestion && <article className={styles.question} key={question.id}>
          <div ref={questionHeading} tabIndex={-1} className={styles.questionTitle}>Soal {index + 1} dari {attempt.questions.length}</div>
          {question.passage && <AssessmentPassageContent passage={question.passage} />}
          {!question.passage && question.reading_passage && <PlacementRichText value={question.reading_passage} />}
          {question.instruction && <PlacementRichText value={question.instruction} />}
          {question.audio_url && (review ? <audio controls preload="none" src={contentMedia(question.audio_url, question.audio_url_resolved_url)} aria-label={`Audio soal ${index + 1}`} /> : <QuestionAudioPlayer key={`${attempt.id}:${question.id}`} endpoint={`/api/assessment-audio/daily-practice/${attempt.id}/${question.id}`} src={contentMedia(question.audio_url, question.audio_url_resolved_url) ?? ""} disabled={completed || expired} />)}
          {question.japanese && <p lang="ja"><ruby>{question.japanese.text}<rt>{question.japanese.reading}</rt></ruby></p>}
          <AssessmentContent content={question}><h3 id={`daily-question-${question.id}`}>{index + 1}. <PlacementRichText value={question.question ?? question.prompt ?? ""} /></h3></AssessmentContent>
          <fieldset className={styles.options} disabled={completed || busy || expired} aria-labelledby={`daily-question-${question.id}`}>
            <legend className="sr-only">Pilihan jawaban soal {index + 1}</legend>
            {Object.entries(question.options).map(([letter, text]) => <label key={letter}><input type="radio" name={`daily-${question.id}`} value={letter} checked={answers[question.id] === letter} onChange={() => choose(question.id, letter)} /><span>{letter}. <PlacementRichText value={text} /></span></label>)}
          </fieldset>
          {review && <div className={styles.explanation}><p>Jawaban kamu: {answers[question.id] ?? "Belum dijawab"}</p>{question.correct_option && <p>Jawaban benar: {question.correct_option}</p>}{question.explanation && <PlacementRichText value={question.explanation} />}</div>}
        </article>)}
        {(!completed || review) && <div className={styles.runnerActions}><button type="button" className="button" disabled={activeQuestion === 0 || busy} onClick={() => setActiveQuestion(value => value - 1)}>Sebelumnya</button>{activeQuestion < attempt.questions.length - 1 ? <button type="button" className="button button-primary" disabled={busy} onClick={() => setActiveQuestion(value => value + 1)}>Selanjutnya</button> : !completed && <button type="button" className="button button-primary" disabled={busy || expired || Boolean(saveError)} onClick={() => setConfirmation("submit")}>{busy ? "Mengumpulkan…" : "Kumpulkan Jawaban"}</button>}</div>}
      </section> : <>
        <div className={styles.tabs} role="group" aria-label="Periode latihan"><button type="button" aria-pressed={!archive} onClick={() => { setArchive(false); setDate(wibDate()); setReload(value => value + 1); }}>Hari Ini</button><button type="button" aria-pressed={archive} onClick={() => setArchive(true)}>Arsip</button></div>
        <div className={styles.filters}>
          <label>Tanggal (WIB)<input ref={dateInput} type="date" value={date} max={archive ? wibDate() : undefined} onChange={event => { if (event.target.value) { setDate(event.target.value); setArchive(event.target.value !== wibDate()); setItems(undefined); } }} /></label>
          <label>Kategori<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">Semua Kategori</option>{Object.entries(dailyPracticeCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Filter Level<select value={level} onChange={event => setLevel(event.target.value)}><option value="all">Semua Level</option>{[...new Set((items ?? []).map(item => item.target_level))].sort().map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
        </div>
        <p>Arsip: pilih tanggal sebelumnya untuk melihat hasil dan pembahasan latihan yang sudah selesai.</p>
        {!items && !error && <LoadingSkeleton variant="cards" label="Memuat latihan…" />}
        {items && !filtered.length && !error && <section className={styles.emptyLayout} aria-label="Informasi daftar kosong">
          <div className={styles.emptyMain}>
            <span className={styles.emptyIllustration} aria-hidden="true"><FiCalendar /></span>
            <div role="status"><span className={styles.emptyBadge}>{filterEmpty ? "HASIL FILTER KOSONG" : emptyToday ? "BELUM ADA JADWAL" : "TANGGAL TANPA LATIHAN"}</span>
              <h2>{filterEmpty ? "Tidak ada latihan yang cocok" : emptyToday ? "Belum ada latihan hari ini" : "Belum ada latihan pada tanggal ini"}</h2>
              <p>{filterEmpty ? "Tidak ditemukan latihan dengan kategori dan level yang dipilih. Coba ubah atau reset filter untuk melihat latihan lainnya." : emptyToday ? "Belum ada latihan yang dijadwalkan untuk hari ini. Kamu bisa membuka arsip untuk melihat latihan sebelumnya." : "Tidak ditemukan latihan untuk tanggal ini. Pilih tanggal lain untuk melihat latihan yang tersedia."}</p>
            </div>
            <div className={styles.emptyActions}>{filterEmpty ? <button type="button" className="button button-primary" onClick={() => { setCategory("all"); setLevel("all"); }}>Reset Filter</button> : <>
              <button type="button" className="button button-primary" onClick={() => { setArchive(true); chooseDate(); }}>Lihat Arsip</button>
              {emptyToday ? <button type="button" className="button" onClick={chooseDate}>Pilih Tanggal Lain</button> : <button type="button" className="button" onClick={() => { setArchive(false); setDate(wibDate()); setItems(undefined); setReload(value => value + 1); }}>Kembali ke Hari Ini</button>}
            </>}</div>
          </div>
          <aside className={styles.emptyInfo} aria-labelledby="daily-empty-info"><h2 id="daily-empty-info">Tetap siap untuk latihan berikutnya</h2><p>Latihan akan muncul sesuai jadwal yang dipublikasikan. Kamu juga bisa melihat latihan sebelumnya.</p>
            <ol><li><span aria-hidden="true">01</span><div><h3>Cek jadwal harian</h3><p>Pilih tanggal untuk melihat latihan yang tersedia.</p></div></li><li><span aria-hidden="true">02</span><div><h3>Buka riwayat latihan</h3><p>Lihat hasil latihan yang sudah dikerjakan.</p></div></li><li><span aria-hidden="true">03</span><div><h3>Lihat pembahasan</h3><p>Tersedia setelah jadwal latihan berakhir.</p></div></li></ol>
            <p className={styles.emptyNote}>Tidak adanya latihan untuk tanggal tertentu bukan berarti progres belajar hilang.</p>
          </aside>
        </section>}
        {items && <p className={styles.count}>{filtered.length} latihan · {archive ? "Arsip" : "Hari ini"}</p>}
        <section className={styles.list} aria-label="Daftar latihan harian">{filtered.map(item => { const Icon = categoryIcons[item.category]; return <article key={item.id} className={styles.card}>
          <span className={styles.categoryIcon} aria-hidden="true"><Icon /></span><div className={styles.cardInfo}><h2>{item.title}</h2><p>{dailyPracticeCategories[item.category]} · Target {item.target_level.toUpperCase()} · {item.question_count} soal</p><p>Jadwal: {schedule(item.starts_at)} – {schedule(item.ends_at)} WIB</p></div>
          <span className={styles.badge} data-status={item.status}>{statusLabels[item.status]}</span>
          <button type="button" className={`button ${["upcoming", "closed"].includes(item.status) ? "" : "button-primary"}`} disabled={busy} onClick={() => void open(item)}>{item.status === "open" ? "Mulai Latihan" : item.status === "in_progress" ? "Lanjutkan" : item.status === "completed" ? "Lihat Hasil" : "Lihat Detail"}<span className="sr-only"> {item.title}</span></button>
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
