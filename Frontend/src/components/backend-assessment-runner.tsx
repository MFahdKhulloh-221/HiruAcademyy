"use client";



import { tryoutStudyRecommendations } from "@/lib/tryout-study-recommendation";



import { PlacementRichText } from "@/components/placement-rich-text";

import Link from "next/link";



import { Fragment, useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import { useAssessmentAttempt } from "@/components/assessment-hooks";

import { LoadingSkeleton } from "@/components/loading-skeleton";

import { useLearningRequest } from "@/components/learning-hooks";

import { apiRequest } from "@/lib/api";

import { FiClock, FiList, FiBarChart2, FiFileText, FiAlertTriangle, FiBookOpen, FiHeadphones, FiCheckSquare, FiArrowLeft, FiArrowRight, FiMenu } from "react-icons/fi";

import "./assessment-layout.css";

import "./answer-review.css";

import { assessmentSessions, assessmentSessionLabels, tryOutRemaining, type AttemptDomain } from "@/lib/assessment-attempt";



export function BackendAssessmentRunner({ path, domain = "learning", title, startBody = {}, className = "learning-question-page", onComplete, onBack, scope, autoStart = false, startActions, readingContext, resultContext }: { resultContext?: { level: string; bestScore: number | null }; readingContext?: { label: string; href: string }; startActions?: (busy: boolean) => ReactNode; onBack?: () => void; autoStart?: boolean; scope?: string; path: string; domain?: AttemptDomain; title: string; startBody?: object; className?: string; onComplete?: () => void }) {

  const [reviewing, setReviewing] = useState(false);
  const tryoutExperience = domain === "tryout" || domain === "checkpoint";

  const examName = domain === "checkpoint" ? "Checkpoint" : "Try Out";

  const flow = useAssessmentAttempt(path, domain, scope, domain === "learning" && "kind" in startBody && startBody.kind === "audio");

  const loadInfo = useCallback((signal: AbortSignal) => tryoutExperience

    ? apiRequest<{ data: { duration_minutes: number | null; max_score: number; sessions: Record<string, string> } }>(path.replace(/\/attempts$/, ""), { signal }).then(response => response.data)

    : Promise.resolve(undefined), [tryoutExperience, path]);

  const info = useLearningRequest(loadInfo, path);

  const automaticStart = useRef(false);

  useEffect(() => {

    if (automaticStart.current || flow.loadingAttempt || flow.busy || flow.attempt || flow.error) return;

    if (!autoStart && !(domain === "learning" && !scope && new URLSearchParams(window.location.search).get("start") === "1")) return;

    automaticStart.current = true;

    void flow.start(startBody);

  }, [autoStart, domain, scope, flow, startBody]);

  const [index, setQuestionIndex] = useState(0);

  const [checking, setChecking] = useState(false);

  const [navigatorVisible, setNavigatorVisible] = useState(true);

  const [confirming, setConfirming] = useState<false | "sync" | "submit">(false);

  const actionDialog = useRef<HTMLDialogElement>(null);

  const [examAction, setExamAction] = useState<"start" | "exit">("start");

  function requestStart() {

    if (!tryoutExperience) { void flow.start(startBody); return; }

    setExamAction("start");

    actionDialog.current?.showModal();

  }

  async function confirmExamAction() {

    if (examAction === "start") {

      actionDialog.current?.close();

      setQuestionIndex(0);

      setChecking(false);

      setReviewing(false);

      await flow.start(startBody);

    } else if (await flow.abandon()) {

      actionDialog.current?.close();

      onBack?.();

    }

  }

  const examDialog = tryoutExperience ? <dialog ref={actionDialog} className="tryout-finish-dialog" aria-labelledby="tryout-action-title" aria-describedby="tryout-action-description" onCancel={event => { if (flow.busy) event.preventDefault(); }}>

    <div className="tryout-finish-icon"><FiAlertTriangle aria-hidden="true" /></div>

    <h2 id="tryout-action-title">{examAction === "start" ? `Siap memulai ${examName} sekarang?` : "Yakin ingin keluar sesi?"}</h2>

    <p id="tryout-action-description">{examAction === "start" ? "Waktu ujian akan langsung berjalan setelah kamu menekan Mulai dan tetap berjalan meskipun kamu berpindah halaman. Pastikan kamu sudah siap dan koneksi internet stabil." : "Keluar Sesi akan mengakhiri pengerjaan ini. Jawaban tidak dapat dilanjutkan; saat memulai kembali, kamu akan mengerjakan dari soal pertama dengan jawaban kosong dan waktu penuh. Jika hanya ingin berpindah halaman, gunakan menu lain tanpa menekan Keluar Sesi."}</p>

    {examAction === "exit" && flow.error && <p role="alert">{flow.error}</p>}

    <div className="tryout-check-actions"><button type="button" className="button button-secondary" autoFocus disabled={flow.busy} onClick={() => actionDialog.current?.close()}>Kembali</button><button type="button" className="button button-primary" disabled={flow.busy} onClick={() => void confirmExamAction()}>{flow.busy ? "Memproses?" : examAction === "start" ? "Mulai" : "Keluar Sesi"}</button></div>

  </dialog> : null;

  const checkHeading = useRef<HTMLHeadingElement>(null);

  const finishDialog = useRef<HTMLDialogElement>(null);

  const finishDecision = useRef<((confirmed: boolean) => void) | null>(null);

  const [pendingUnanswered, setPendingUnanswered] = useState(0);

  useEffect(() => () => { finishDecision.current?.(false); }, []);

  function decideFinish(confirmed: boolean) {

    finishDialog.current?.close();

    finishDecision.current?.(confirmed);

    finishDecision.current = null;

  }



  const finalSubmission = useRef(false);



  const [now, setNow] = useState(0);

  const expiredSubmission = useRef<number | null>(null);

  const attempt = flow.attempt;

  const isReading = domain === "learning" && "kind" in startBody && startBody.kind === "reading";

  const questions = attempt?.questions ?? [];

  const question = questions[Math.min(index, Math.max(questions.length - 1, 0))];

  const sessionIndex = assessmentSessions.findIndex(session => session === question?.session);

  const sessionLabel = assessmentSessionLabels[sessionIndex];

  const sessionQuestions = tryoutExperience ? questions.filter(item => item.session === question?.session) : questions;

  function navigateTryOut(position: number, check = false) {

    setQuestionIndex(position);

    setChecking(check);

    if (!tryoutExperience) return;

    const url = new URL(window.location.href);

    if (check) url.searchParams.set(`${domain}_stage`, "check");

    else url.searchParams.delete(`${domain}_stage`);

    if (questions[position]) url.searchParams.set(`${domain}_question`, String(questions[position].id));

    else url.searchParams.delete(`${domain}_question`);

    window.history.pushState(null, "", url);

  }

  function setIndex(value: number | ((previous: number) => number)) {

    navigateTryOut(typeof value === "function" ? value(index) : value);

  }

  const restoreTryOut = useEffectEvent(() => {

    const params = new URLSearchParams(window.location.search);

    const position = questions.findIndex(item => String(item.id) === params.get(`${domain}_question`));

    setQuestionIndex(Math.max(0, position));

    setChecking(params.get(`${domain}_stage`) === "check");

  });

  useEffect(() => {

    if (!tryoutExperience || !attempt?.id) return;

    const restore = () => restoreTryOut();

    const timer = window.setTimeout(restore, 0);

    window.addEventListener("popstate", restore);

    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", restore); };

  }, [tryoutExperience, attempt?.id]);

  useEffect(() => {

    if (checking) checkHeading.current?.focus();

  }, [checking]);

  async function finishTryOut() {

    if (finalSubmission.current || attempt?.status !== "in_progress") return;

    finalSubmission.current = true;

    setConfirming("sync");

    try {

      if (attempt && tryOutRemaining(attempt, performance.now()) === 0) { await flow.expire(); return; }

      const synced = await flow.synchronize();

      if (!synced || synced.status === "completed") return;

      if (tryOutRemaining(synced, performance.now()) === 0) { await flow.expire(); return; }

      const unanswered = synced.questions.filter(item => !synced.answers[item.id]).length;

      setPendingUnanswered(unanswered);

      const accepted = await new Promise<boolean>(resolve => {

        finishDecision.current = resolve;

        finishDialog.current?.showModal();

      });

      if (accepted) {

        setConfirming("submit");

        await flow.submit();

      }

    } finally {

      finalSubmission.current = false;

      setConfirming(false);

    }

  }

  const result = attempt?.result;

  const passed = domain === "learning" && "kind" in startBody && startBody.kind === "mini" ? result?.passed : result?.overall_pass;

  useEffect(() => {

    if (tryoutExperience || !attempt?.expires_at || attempt.status === "completed") return;

    const timer = window.setInterval(() => setNow(scope ? performance.now() : Date.now()), scope ? 250 : 1000);

    return () => window.clearInterval(timer);

  }, [tryoutExperience, attempt?.expires_at, attempt?.status, scope]);

  useEffect(() => {

    if (attempt?.status === "completed") onComplete?.();

  }, [attempt?.id, attempt?.status, onComplete]);

  useEffect(() => {

    if (!tryoutExperience || !attempt?.expires_at || attempt.status === "completed") return;

    const timer = window.setInterval(() => setNow(performance.now()), 1000);

    return () => window.clearInterval(timer);

  }, [tryoutExperience, attempt?.id, attempt?.expires_at, attempt?.status]);

  const remaining = tryoutExperience && attempt ? tryOutRemaining(attempt, now) : !tryoutExperience && attempt?.expires_at ? scope && attempt.server_now && attempt.request_started_at !== undefined && attempt.received_at !== undefined ? Math.max(0, Math.ceil((Date.parse(attempt.expires_at) - Date.parse(attempt.server_now) - Math.max(0, Math.max(now, attempt.received_at) - attempt.request_started_at)) / 1000)) : !scope && now ? Math.max(0, Math.ceil((Date.parse(attempt.expires_at) - now) / 1000)) : null : null;

  useEffect(() => {

    if (attempt?.status !== "in_progress" || remaining !== 0) return;

    if (tryoutExperience) {

      if (expiredSubmission.current === attempt.id) return;

      expiredSubmission.current = attempt.id;

      void flow.expire();

      return;

    }

    if (flow.busy) return;

    if (scope) {

      if (expiredSubmission.current === attempt.id) return;

      expiredSubmission.current = attempt.id;

      void flow.submit();

    } else if (!flow.error) void flow.submit();

  }, [remaining, flow, attempt?.status, attempt?.id, scope, domain, tryoutExperience]);

  const tryOutTimer = tryoutExperience && remaining !== null ? <div className="checkpoint-timer" role="timer"><span>TIMER</span>{tryoutExperience && <FiClock aria-hidden="true" />}<strong>{tryoutExperience ? `${String(Math.floor(remaining / 3600)).padStart(2, "0")}:` : ""}{String(tryoutExperience ? Math.floor(remaining / 60) % 60 : Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</strong><small>Sisa waktu ujian</small></div> : null;

  if (flow.loadingAttempt) return <section className={className}><LoadingSkeleton variant="assessment" label="Memuat…" /></section>;

  if (!attempt && tryoutExperience) return <section className="tryout-prestart">{examDialog}<div className="tryout-prestart-layout"><div className="tryout-prestart-main"><section className="tryout-prestart-info"><p className="dash-kicker">INFORMASI SIMULASI</p><h1>{title}</h1><div className="tryout-info-tiles"><div><FiClock aria-hidden="true" /><strong>{info.data?.duration_minutes == null ? "—" : `${info.data.duration_minutes} Menit`}</strong><span>Total Waktu</span></div><div><FiList aria-hidden="true" /><strong>{info.data ? Object.keys(info.data.sessions).length : "—"}</strong><span>Pembagian</span></div><div><FiBarChart2 aria-hidden="true" /><strong>{info.data?.max_score ?? "—"}</strong><span>Skor Maksimal</span></div><div><FiCheckSquare aria-hidden="true" /><strong>Review Mode</strong><span>Tersedia: —</span></div></div></section><section className="assessment-warning"><h2><FiAlertTriangle aria-hidden="true" />Instruksi & Ketentuan Ujian</h2><p>{info.data?.duration_minutes != null ? `Pengerjaan dibatasi ${info.data.duration_minutes} menit sesuai durasi yang ditampilkan. Waktu berjalan sejak ${examName} dimulai.` : "Ikuti informasi waktu yang ditampilkan saat pengerjaan."}</p><p>Pastikan koneksi internet stabil. Periksa jawaban sebelum menyelesaikan kuis. Setelah submit final, jawaban tidak dapat diubah; gunakan Review Jawaban pada hasil untuk memeriksa jawaban.</p></section></div><section className="tryout-sections"><h2>Materi Sesi</h2>{Object.entries(info.data?.sessions ?? {}).map(([code, label]) => { const Icon = code === "audio" ? FiHeadphones : code === "reading" ? FiBookOpen : code === "grammar" ? FiFileText : FiList; return <div key={code}><Icon aria-hidden="true" /><strong><PlacementRichText value={label} /></strong></div>; })}</section><div className="tryout-prestart-action"><p className="exam-start-notice">Dengan menekan Mulai, kamu menyatakan telah membaca dan memahami instruksi serta ketentuan ujian di atas.</p>{startActions?.(flow.busy)}{flow.error && <p role="alert">{flow.error}</p>}<button className="button button-primary" type="button" disabled={flow.busy} onClick={requestStart}>Mulai {examName}</button>{onBack && <button className="button button-secondary" type="button" disabled={flow.busy} onClick={onBack}>Kembali</button>}</div>{info.error && <p className="tryout-prestart-error" role="alert">{info.error}</p>}</div></section>;

  if (!attempt) return <section className={className}><header className="learning-question-head"><h1>{title}</h1></header>{flow.error && <p role="alert">{flow.error}</p>}<button className="button button-primary" type="button" disabled={flow.busy || domain === "placement"} onClick={() => void flow.start(startBody)}>Mulai</button></section>;

  if (tryoutExperience && attempt.status === "completed" && result && !reviewing) return (

    <section className={`tryout-result-page${tryoutExperience ? " tryout-result-redesign" : ""}`}>

      {examDialog}

      {tryoutExperience && onBack && <button className="result-back-link" type="button" onClick={onBack}><FiArrowLeft aria-hidden="true" />Kembali ke Daftar</button>}

      <header className="tryout-result-header"><div><h1>Hasil {title}</h1><p>{tryoutExperience ? "Lihat pencapaianmu dan temukan materi yang perlu ditingkatkan." : "Ringkasan hasil pengerjaan simulasi"}</p></div>{resultContext && <span className="tryout-best-score">{tryoutExperience ? "Skor Terbaik" : "Best Score"}: <strong>{resultContext.bestScore ?? "—"}</strong></span>}</header>

      {flow.error && <p role="alert">{flow.error}</p>}

      {tryoutExperience && <div className="result-hero-summary">

        <section className="result-best-card"><h2>Skor Terbaik</h2><div className="result-hero-value">{resultContext?.bestScore ?? "—"}<span>/ {result.max ?? result.correct + result.wrong + result.unanswered}</span></div><h3>Tetap semangat!</h3><p>Setiap latihan adalah langkah untuk meningkatkan kemampuanmu. Yuk, tinjau jawaban dan coba lagi!</p></section>

        <section className="result-total-card"><h2>Total Skor</h2><div className="result-hero-value">{result.earned ?? result.correct}<span>/ {result.max ?? result.correct + result.wrong + result.unanswered}</span></div><span className="result-status">{passed === true ? "Lulus" : passed === false ? "Belum lulus" : "—"}</span><p>Hasil pengerjaan simulasi ini</p></section>

      </div>}

      <section className="tryout-result-score">

        <div className="tryout-result-details">

          <h2>{tryoutExperience ? "Rincian Nilai per Bagian" : "RINCIAN SKOR"}</h2>

          <div className="tryout-result-sessions">{result.sessions?.map(section => (

            <article key={section.code}>

              <h3>{assessmentSessionLabels[assessmentSessions.findIndex(code => code === section.code)] ?? section.label}</h3>

              <div><span>{tryoutExperience ? "Skor bagian" : "Nilai Section"}</span><strong>{section.passing_score_basis === "points" ? section.earned : section.correct} / {section.passing_score_basis === "points" ? section.max : section.correct + section.wrong + section.unanswered}</strong></div>

              {tryoutExperience && <small>Batas lulus: {section.passing_score} {section.passing_score_basis === "points" ? "poin" : "jawaban benar"}</small>}

              {tryoutExperience && <span className="tryout-result-pass" data-passed={section.pass}>{section.pass ? "Lulus" : "Belum lulus"}</span>}

            </article>

          ))}</div>

        </div>

        {!tryoutExperience && <div className="tryout-result-total"><h2>TOTAL SKOR</h2><strong>{result.earned ?? result.correct}</strong><span>/ {result.max ?? result.correct + result.wrong + result.unanswered}</span><p>{passed === true ? "LULUS" : passed === false ? "BELUM LULUS" : "—"}</p></div>}

      </section>

      <div className="tryout-result-info-grid tryout-result-learning-card">

        <section className="tryout-result-reference"><h2>Ringkasan Jawaban</h2><dl><div><dt>{tryoutExperience ? "Benar" : "Jawaban Benar"}</dt><dd>{result.correct}</dd></div><div><dt>{tryoutExperience ? "Salah" : "Jawaban Salah"}</dt><dd>{result.wrong}</dd></div><div><dt>{tryoutExperience ? "Kosong" : "Tidak Dijawab"}</dt><dd>{result.unanswered}</dd></div></dl></section>

        <section className="tryout-result-recommendation"><h2>Rekomendasi Belajar</h2>{tryoutStudyRecommendations(result.sessions).length ? <><p className="study-recommendation-intro">{tryoutExperience ? "Fokus pada materi yang perlu ditingkatkan. Pilih salah satu untuk melihat saran belajar." : "Mulai dari materi dengan nilai terendah. Gunakan Review Jawaban untuk melihat bagian yang perlu diulang."}</p><ol className="study-recommendation-list">{tryoutStudyRecommendations(result.sessions).map((item, index) => <li key={item.code}><span className="study-recommendation-number" aria-hidden="true">{index + 1}</span><div><header><h3>{assessmentSessionLabels[assessmentSessions.findIndex(code => code === item.code)] ?? item.label}</h3><span className="study-recommendation-score" aria-label={`Nilai sesi ${item.percentage} persen`}>{item.percentage}%</span></header><p>{item.description}</p>{resultContext && <Link className="study-recommendation-link" href={item.code === "reading" || item.code === "audio" ? `/practice?level=${encodeURIComponent(resultContext.level.toLowerCase())}&category=${item.code}` : `/journey/${encodeURIComponent(resultContext.level.toLowerCase())}`}>Pelajari {item.code === "reading" ? "Reading" : item.code === "audio" ? "Audio" : assessmentSessionLabels[assessmentSessions.findIndex(code => code === item.code)] ?? item.label}<FiArrowRight aria-hidden="true" /></Link>}</div></li>)}</ol></> : <p>Rincian nilai sesi belum tersedia untuk menentukan rekomendasi belajar.</p>}</section>

      </div>

      <div className="tryout-result-actions" aria-label="Aksi hasil ujian">

        {tryoutExperience && <button className="button button-primary tryout-result-review" type="button" disabled={flow.busy} onClick={async () => { if (await flow.review()) { setIndex(0); setReviewing(true); } }}>Review Jawaban<FiArrowRight aria-hidden="true" /></button>}

        {!tryoutExperience && onBack && <button className="button button-secondary tryout-result-back" type="button" onClick={onBack}><FiArrowLeft aria-hidden="true" />Kembali ke Daftar</button>}

        <button className="button button-secondary tryout-result-retry" type="button" disabled={flow.busy} onClick={requestStart}>Ulangi {examName}</button>

        {!tryoutExperience && <button className="button button-primary tryout-result-review" type="button" disabled={flow.busy} onClick={async () => { if (await flow.review()) { setIndex(0); setReviewing(true); } }}>Review Jawaban<FiArrowRight aria-hidden="true" /></button>}

        {tryoutExperience && onBack && <button className="button result-back-link" type="button" onClick={onBack}>Kembali ke Daftar</button>}

      </div>

    </section>

  );

  if (domain === "learning" && (attempt.kind === "audio" || attempt.kind === "reading") && attempt.status === "completed" && result && !reviewing) return (

    <section className="daily-practice-result" aria-label={`Hasil ${title}`}>

      <header className="daily-result-header"><span className="daily-result-icon">{isReading ? <FiBookOpen aria-hidden="true" /> : <FiHeadphones aria-hidden="true" />}</span><div><p>LATIHAN SELESAI</p><h1>Hasil {title}</h1><p>Ringkasan jawaban latihanmu.</p></div></header>

      {flow.error && <p role="alert">{flow.error}</p>}

      <div className="daily-result-summary">

        <div className="daily-result-score"><span>Skor latihan</span><strong>{result.earned ?? result.percentage ?? "—"}{result.max !== undefined && <small> / {result.max}</small>}</strong><span>{result.max === undefined && result.percentage !== undefined ? "dari 100" : "Skor dari sistem"}</span></div>

        <dl className="daily-result-stats"><div><dt>Jawaban benar</dt><dd>{result.correct}</dd></div><div><dt>Jawaban salah</dt><dd>{result.wrong}</dd></div><div><dt>Tidak dijawab</dt><dd>{result.unanswered}</dd></div></dl>

      </div>

      {!isReading && result.recommendation_level && result.recommendation_level.trim() !== "—" && <section className="daily-result-note"><h2>Rekomendasi</h2><p>{result.recommendation_level}</p></section>}

      <footer className="daily-result-actions"><button className="button daily-result-review" type="button" disabled={flow.busy} onClick={async () => { if (await flow.review()) { setIndex(0); setReviewing(true); } }}>Review Jawaban<FiArrowRight aria-hidden="true" /></button><button className="button daily-result-retry" type="button" disabled={flow.busy} onClick={() => { setIndex(0); void flow.start(startBody); }}>Coba Lagi</button></footer>

    </section>

  );

  if (attempt.status === "completed" && result && !reviewing) return <section className="checkpoint-result tryout-result-report"><h1>Hasil {title}</h1>{flow.error && <p role="alert">{flow.error}</p>}<div className="checkpoint-result-stats"><div><span>Skor</span><strong>{result.earned ?? result.percentage ?? "—"}{result.max !== undefined ? ` / ${result.max}` : ""}</strong></div><div><span>Jawaban benar</span><strong>{result.correct}</strong></div><div><span>Tidak Dijawab</span><strong>{result.unanswered}</strong></div></div>{result.sessions && <section className="tryout-section-scores">{result.sessions.map(section => <article key={section.code}><strong>{tryoutExperience ? assessmentSessionLabels[assessmentSessions.findIndex(code => code === section.code)] ?? section.label : section.label}</strong><b>{section.earned} / {section.max}</b><small>Passing score: {section.passing_score} • {section.passing_score_basis === "points" ? "Skor" : "Jawaban benar"}</small>{(!tryoutExperience || result.total_passing_score != null) && <span>{section.pass ? "LULUS" : "TIDAK LULUS"}</span>}</article>)}</section>}{(!tryoutExperience || result.total_passing_score != null) && <p>{passed === true ? "LULUS" : passed === false ? "TIDAK LULUS" : "—"}</p>}<section className="checkpoint-recommendation"><p className="dash-kicker">REKOMENDASI</p><p>{isReading ? "Data topik bacaan belum cukup untuk memberikan rekomendasi belajar." : result.recommendation_level ?? "—"}</p></section>{domain !== "placement" && <button className="button button-secondary" type="button" disabled={flow.busy} onClick={async () => { if (await flow.review()) { setIndex(0); setReviewing(true); } }}>Review Jawaban</button>}<button className="button button-secondary" type="button" disabled={flow.busy} onClick={() => { setIndex(0); void flow.start(startBody); }}>Coba Lagi</button></section>;

  if (tryoutExperience && attempt.status === "in_progress" && checking) {

    const answered = questions.filter(item => Boolean(flow.answers[item.id])).length;

    const unanswered = questions.length - answered;

    return <section className="tryout-answer-check" aria-busy={Boolean(confirming)}>

      <header className="tryout-check-header"><p className="tryout-check-eyebrow">PEMERIKSAAN AKHIR</p><h1 ref={checkHeading} tabIndex={-1}>Periksa Jawaban</h1><p>{title}</p><p>Periksa kelengkapan jawabanmu. Pilih nomor soal untuk kembali mengedit sebelum menyelesaikan kuis.</p><dl className="tryout-check-summary"><div><dt>Total soal</dt><dd>{questions.length}</dd></div><div><dt>Terjawab</dt><dd>{answered}</dd></div><div><dt>Belum dijawab</dt><dd>{unanswered}</dd></div></dl></header>

      <dialog ref={finishDialog} className="tryout-finish-dialog" aria-labelledby="tryout-finish-title" aria-describedby="tryout-finish-description" onCancel={event => { event.preventDefault(); decideFinish(false); }}>

        <div className="tryout-finish-icon"><FiCheckSquare aria-hidden="true" /></div><h2 id="tryout-finish-title">Selesaikan Kuis?</h2><p id="tryout-finish-description">Jawaban akan dikumpulkan secara final dan tidak dapat diubah. Pastikan kamu sudah memeriksa jawabanmu.</p>

        {pendingUnanswered > 0 && <p className="tryout-check-warning">Masih ada {pendingUnanswered} soal yang belum dijawab. Kamu tetap dapat menyelesaikan {examName}, tetapi soal yang kosong akan dihitung sebagai tidak benar.</p>}

        <div className="tryout-check-actions"><button type="button" className="button button-secondary" autoFocus onClick={() => decideFinish(false)}>Kembali Periksa</button><button type="button" className="button button-primary" onClick={() => decideFinish(true)}>Ya, Selesaikan Kuis</button></div>

      </dialog>

      {tryOutTimer}

      {flow.error && <p role="alert">{flow.error}{remaining === 0 && <button type="button" disabled={flow.busy} onClick={() => void flow.expire()}>Coba Lagi</button>}</p>}

      <div className="tryout-check-sessions">{assessmentSessions.map((session, section) => {

        const items = questions.map((item, position) => ({ item, position })).filter(({ item }) => item.session === session);

        return <section className="tryout-check-card" key={session} aria-labelledby={`tryout-check-${session}`}>

          <h2 id={`tryout-check-${session}`}>{assessmentSessionLabels[section]}</h2>

          <p>{items.filter(({ item }) => Boolean(flow.answers[item.id])).length}/{items.length} dijawab</p>

          <nav aria-label={`Pemeriksaan ${assessmentSessionLabels[section]}`}><div className="tryout-check-numbers">{items.map(({ item, position }) => {

            const checked = Boolean(flow.answers[item.id]);

            return <button type="button" key={item.id} disabled={Boolean(confirming)} className={checked ? "answered" : "unanswered"} aria-label={`Soal ${position + 1}, ${checked ? "Terjawab" : "Belum Dijawab"}`} onClick={() => navigateTryOut(position)}>{checked ? <FiCheckSquare aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />}<span>{position + 1}</span></button>;

          })}</div></nav>

        </section>;

      })}</div>

      {unanswered > 0 && <p className="tryout-check-warning">Masih ada {unanswered} soal yang belum dijawab. Kamu tetap dapat menyelesaikan {examName}, tetapi soal yang kosong akan dihitung sebagai tidak benar.</p>}

      <footer className="tryout-check-actions"><button type="button" className="button button-secondary" disabled={Boolean(confirming)} onClick={() => navigateTryOut(index)}>Kembali ke Soal</button><button type="button" className="button button-primary" aria-busy={Boolean(confirming)} disabled={Boolean(confirming) || flow.submitting} onClick={() => void finishTryOut()}>{confirming === "sync" ? "Menyinkronkan…" : confirming === "submit" ? "Mengumpulkan…" : "Selesaikan Kuis"}</button></footer>

    </section>;

  }

  const isFirst = index === 0;

  const isLast = index >= questions.length - 1;

  const allAnswered = domain === "learning" && startBody && "kind" in startBody && startBody.kind !== "mini"

    ? Object.keys(flow.answers).length === questions.length

    : true;

  const sessionPosition = sessionQuestions.findIndex(item => item.id === question?.id);

  const navigatorPage = Math.floor(Math.max(0, sessionPosition) / 25);

  const navigatorQuestions = tryoutExperience ? sessionQuestions.slice(navigatorPage * 25, (navigatorPage + 1) * 25) : sessionQuestions;

  const navigatorGroups = tryoutExperience ? sessionQuestions.reduce<{ key: string; instruction: typeof question.instruction; items: typeof sessionQuestions }[]>((groups, item) => {

    const key = JSON.stringify(item.instruction ?? null);

    const previous = groups[groups.length - 1];

    if (previous?.key === key) previous.items.push(item);

    else groups.push({ key, instruction: item.instruction, items: [item] });

    return groups;

  }, []) : [{ key: "questions", instruction: undefined, items: navigatorQuestions }];

  const saveStatus = flow.busy ? "Menyimpan…" : flow.error ? "—" : "Tersimpan";

  const answerReview = reviewing && attempt.status === "completed";

  const readingLayout = isReading;

  const examReading = tryoutExperience && question?.session === "reading";

  const QuestionPanel = Fragment;

  const readingPassage = isReading && question ? <section className="reading-passage" key={question.passage?.id ?? JSON.stringify(question.passage ?? question.reading_passage ?? null)} aria-label="Teks bacaan">

    {readingLayout && <header className="reading-passage-header"><FiBookOpen aria-hidden="true" /><h2>Teks Reading</h2></header>}

    <div className="reading-passage-body" lang="ja" tabIndex={0} role="region" aria-label="Isi teks Reading">

      {question.passage ? <><h3><PlacementRichText value={question.passage.title} /></h3><div><PlacementRichText value={question.passage.body} /></div></> : question.reading_passage && <div><PlacementRichText value={question.reading_passage} /></div>}

    </div>

  </section> : null;

  return (

    <div className={tryoutExperience ? `${className} tryout-runner-polished${tryoutExperience ? " tryout-placement-style" : ""}` : `${className}${readingLayout ? " reading-workspace" : ""}${domain === "learning" && (attempt.kind === "audio" || attempt.kind === "reading") && !answerReview ? " daily-practice-runner" : ""}`}>

      {examDialog}

      <header className={`learning-question-head${tryoutExperience ? " tryout-exam-topbar" : ""}`} aria-label={tryoutExperience ? `Informasi pengerjaan ${examName}` : undefined}>

        {readingLayout ? <div><h1>{answerReview ? `Review Jawaban · ${title}` : title}</h1>{readingContext && <p>{readingContext.label}</p>}</div> : tryoutExperience ? <h1>{reviewing ? "Review Jawaban · " : ""}<strong>{title.split(" - ")[0]}</strong><span>{title.includes(" - ") ? ` | ${title.split(" - ").slice(1).join(" - ")}` : ""}{sessionLabel ? ` - ${sessionLabel}` : ""}</span></h1> : tryoutExperience ? <><h1>{reviewing ? "Review Jawaban · " : ""}Soal {Math.min(index + 1, questions.length)} dari {questions.length}</h1><p>{title}{sessionLabel ? ` • ${sessionLabel}` : ""}</p><p className="tryout-runner-status">{questions.filter(item => flow.answers[item.id]).length} / {questions.length} Terjawab<span role="status">{saveStatus}</span></p></> : <h1>{answerReview ? `Review Jawaban ? ${title}` : title}</h1>}

        {tryOutTimer ?? (tryoutExperience && <div className="checkpoint-timer" role="timer"><span>Sisa waktu</span><strong>—</strong><small>Durasi belum tersedia</small></div>)}

        {!readingLayout && !(domain === "learning" && attempt.kind === "audio") && !tryoutExperience && remaining !== null && (

          <div className="checkpoint-timer" role="timer">

            <span>Waktu tersisa</span>

            <strong>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</strong>

          </div>

        )}

      </header>

      {flow.error && <p role="alert">{flow.error}<button type="button" disabled={flow.busy} onClick={() => void (tryoutExperience && remaining === 0 ? flow.expire() : scope && remaining === 0 ? flow.submit() : flow.retrySave())}>Coba Lagi</button></p>}

      {answerReview && <p className="answer-review-legend">Keterangan: Jawaban benar (hijau) · Jawaban kamu salah (merah) · Tidak dijawab</p>}

      {tryoutExperience && !navigatorVisible && <div className="tryout-navigator-toggle"><button type="button" className="button button-secondary" aria-label="Tampilkan Navigator" title="Tampilkan Navigator" aria-expanded={false} aria-controls="tryout-question-navigator" onClick={() => setNavigatorVisible(true)}><FiMenu aria-hidden="true" /></button></div>}

      <div className={["learning-question-layout", tryoutExperience && !navigatorVisible && "tryout-navigator-hidden", answerReview && "answer-review", examReading && tryoutExperience && "tryout-shared-reading", isReading && "reading-panels"].filter(Boolean).join(" ")}>

        {isReading && !readingLayout && question && <section className="reading-passage" aria-label="Teks bacaan" tabIndex={0}>

          {question.instruction && <p className="reading-instruction"><PlacementRichText value={question.instruction} /></p>}

          {question.passage ? <><h2><PlacementRichText value={question.passage.title} /></h2><p><PlacementRichText value={question.passage.body} /></p></> : question.reading_passage && <p><PlacementRichText value={question.reading_passage} /></p>}

        </section>}

        <QuestionPanel>

        <main>

          {readingLayout && readingPassage}

          {examReading && question && <section className="exam-reading-passage" key={question.passage?.id ?? question.id} aria-label="Teks bacaan"><h2><FiBookOpen aria-hidden="true" /> Teks Bacaan</h2><div className="exam-reading-scroll" role="region" aria-label="Isi teks bacaan" tabIndex={0} lang="ja">

            {question.passage ? <><h3><PlacementRichText value={question.passage.title} /></h3><PlacementRichText value={question.passage.body} /></> : <PlacementRichText value={question.reading_passage ?? ""} />}

          </div></section>}

          {question && (

            <section className={`learning-question-card${examReading ? " exam-reading-questions" : ""}`} tabIndex={examReading ? 0 : undefined} aria-label={examReading ? "Pertanyaan dan pilihan jawaban" : undefined}>

              <p className="dash-kicker">{tryoutExperience ? <>{sessionLabel && <span>{sessionLabel}</span>}<span>Soal {sessionPosition + 1}</span></> : <>SOAL {Math.min(index + 1, questions.length)} DARI {questions.length}</>}</p>

              {!isReading && !examReading && question.passage && <section className="reading-passage"><h2><PlacementRichText value={question.passage.title} /></h2><p><PlacementRichText value={question.passage.body} /></p></section>}

              {!isReading && !examReading && question.reading_passage && <p><PlacementRichText value={question.reading_passage} /></p>}

              {(question.audio_url_resolved_url === undefined ? question.audio_url : question.audio_url_resolved_url) ? (

                <audio controls src={(question.audio_url_resolved_url === undefined ? question.audio_url : question.audio_url_resolved_url) || undefined} aria-label={question.title ?? "Audio"} />

              ) : question.audio_url ? <p role="status">Audio belum tersedia.</p> : null}

              {!isReading && question.instruction && <p><PlacementRichText value={question.instruction} /></p>}

              {readingLayout ? <div className="reading-question-copy" tabIndex={0} role="region" aria-label="Isi pertanyaan">

                {question.instruction && <div><PlacementRichText value={question.instruction} /></div>}

                <h2><PlacementRichText value={question.question ?? question.prompt ?? ""} /></h2>

                {question.japanese?.text && <p lang="ja"><ruby>{question.japanese.text}{question.japanese.reading && <rt>{question.japanese.reading}</rt>}</ruby></p>}

              </div> : <>

                <h2><PlacementRichText value={question.question ?? question.prompt ?? ""} /></h2>

                {question.japanese?.text && <p lang="ja"><ruby>{question.japanese.text}{question.japanese.reading && <rt>{question.japanese.reading}</rt>}</ruby></p>}

              </>}

              <fieldset disabled={Boolean((scope || tryoutExperience) && remaining === 0) || reviewing || flow.submitting || (!tryoutExperience && flow.busy) || attempt.status === "completed"}>

                <legend className="sr-only">Pilihan jawaban</legend>

                {Object.entries(question.options).map(([option, label]) => (

                  <label key={option} className={answerReview ? option === question.correct_option ? "review-correct" : flow.answers[question.id] === option ? "review-wrong" : "" : flow.answers[question.id] === option ? "selected" : ""}>

                    <input

                      type="radio"

                      name={`answer-${question.id}`}

                      checked={flow.answers[question.id] === option}

                      onChange={() => flow.answer(question.id, option)}

                    />

                    {tryoutExperience ? <><span className="tryout-option-letter">{option}.</span>{" "}<span className="tryout-option-text"><PlacementRichText value={label} /></span></> : <span>{option}. <PlacementRichText value={label} /></span>}

                    {answerReview && (option === question.correct_option ? <strong className="tryout-review-label">{flow.answers[question.id] === option ? "Jawaban kamu · Benar" : "Jawaban benar"}</strong> : flow.answers[question.id] === option ? <strong className="tryout-review-label">Jawaban kamu · Salah</strong> : null)}

                  </label>

                ))}

              </fieldset>

              {reviewing && attempt.status === "completed" && (

                <section>

                  {answerReview && <p>Status: {!flow.answers[question.id] ? "Tidak dijawab" : !question.correct_option ? "Belum tersedia" : flow.answers[question.id] === question.correct_option ? "Benar" : "Salah"}</p>}{answerReview && !flow.answers[question.id] && <p>Tidak dijawab</p>}

                  <p>Jawaban benar: <PlacementRichText value={question.correct_option ? question.options[question.correct_option] : "—"} /></p>

                  <p>Penjelasan: {question.explanation ? <PlacementRichText value={question.explanation} /> : "Belum tersedia."}</p>

                </section>

              )}

            </section>

          )}

          <div className="learning-question-actions">

            {reviewing ? (

              <>

                {!isFirst && <button className="button button-secondary" type="button" onClick={() => setIndex(value => value - 1)}>Sebelumnya</button>}

                {!isLast && <button className="button button-secondary" type="button" onClick={() => setIndex(value => value + 1)}>{readingLayout ? "Soal Berikutnya" : "Selanjutnya"}</button>}

                <button type="button" className="button button-primary" onClick={() => setReviewing(false)}>Kembali ke Hasil</button>

              </>

            ) : (

              <>

                {!isFirst && (

                  <button className="button button-secondary" type="button" onClick={() => setIndex(value => value - 1)}>

                    Sebelumnya

                  </button>

                )}

                {!isLast && (

                  <button className="button button-secondary" type="button" onClick={() => setIndex(value => value + 1)}>

                    {readingLayout ? "Soal Berikutnya" : "Selanjutnya"}

                  </button>

                )}

                {tryoutExperience && isLast && questions.length > 0 && <button type="button" className="button button-primary tryout-check-answer" disabled={flow.submitting} onClick={() => navigateTryOut(index, true)}>Periksa Jawaban</button>}

                {!tryoutExperience && isLast && questions.length > 0 && (

                  <button type="button" className="button button-primary" disabled={flow.busy || Boolean(flow.error) || !allAnswered} onClick={() => void flow.submit()}>

                    Kumpulkan Jawaban

                  </button>

                )}

              </>

            )}

          </div>

        </main>

        <aside id={tryoutExperience ? "tryout-question-navigator" : undefined} hidden={tryoutExperience && !navigatorVisible} className="learning-question-sidebar">

          {!answerReview && (readingLayout || (domain === "learning" && attempt.kind === "audio")) && (attempt.expires_at ? remaining !== null && <div className="checkpoint-timer practice-compact-timer" role="timer"><span>Waktu tersisa</span><strong>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</strong></div> : <PracticeElapsedTimer startedAt={attempt.started_at} />)}

          <nav aria-label="Navigasi soal">

            {readingLayout ? <h2>Navigasi Soal</h2> : tryoutExperience ? <header className="tryout-navigator-heading"><h2>NAVIGATOR SOAL</h2><button type="button" className="button button-secondary" aria-label="Sembunyikan Navigator" title="Sembunyikan Navigator" aria-expanded={true} aria-controls="tryout-question-navigator" onClick={() => setNavigatorVisible(false)}><FiMenu aria-hidden="true" /></button></header> : tryoutExperience && <h2>NAVIGATOR SOAL</h2>}

            {navigatorGroups.map((group, groupIndex) => <section className={tryoutExperience ? "tryout-navigator-group" : undefined} key={`${group.key}-${groupIndex}`}>

              {tryoutExperience && group.instruction && <h3><PlacementRichText value={group.instruction} /></h3>}

              <div className={tryoutExperience ? "tryout-group-number-grid" : undefined}>

              {group.items.map(item => {

                const position = questions.findIndex(question => question.id === item.id);

                return <button

                  type="button"

                  key={item.id}

                  aria-label={`Soal ${position + 1}`}

                  aria-current={position === index ? "step" : undefined}

                  title={readingLayout ? (flow.answers[item.id] ? "Terjawab" : "Belum dijawab") : undefined}

                  className={tryoutExperience ? [position === index ? "active" : "", flow.answers[item.id] ? "answered" : ""].filter(Boolean).join(" ") : position === index ? "active" : flow.answers[item.id] ? "answered" : ""}

                  onClick={() => setIndex(position)}

                >

                  {position + 1}

                </button>;

              })}

              </div>

            </section>)}

            {readingLayout && <p className="reading-nav-legend">Oranye: aktif · Bertanda: terjawab · Putih: belum dijawab</p>}

            {!tryoutExperience && tryoutExperience && sessionQuestions.length > 25 && <footer className="tryout-navigator-pages"><button type="button" aria-label="Halaman soal sebelumnya" disabled={navigatorPage === 0} onClick={() => setIndex(questions.findIndex(item => item.id === sessionQuestions[(navigatorPage - 1) * 25]?.id))}><FiArrowLeft aria-hidden="true" /></button><span>{navigatorPage + 1} / {Math.ceil(sessionQuestions.length / 25)}</span><button type="button" aria-label="Halaman soal selanjutnya" disabled={(navigatorPage + 1) * 25 >= sessionQuestions.length} onClick={() => setIndex(questions.findIndex(item => item.id === sessionQuestions[(navigatorPage + 1) * 25]?.id))}><FiArrowRight aria-hidden="true" /></button></footer>}

          </nav>

          {tryoutExperience ? <><h2>PILIH SESI</h2><div className="tryout-session-list">{assessmentSessions.map((session, position) => <button type="button" key={session} aria-pressed={sessionIndex === position} disabled={!questions.some(item => item.session === session)} onClick={() => setIndex(questions.findIndex(item => item.session === session))}>{assessmentSessionLabels[position]}</button>)}</div>{!reviewing && attempt.status !== "completed" && <div className="tryout-sidebar-actions">{questions.length > 0 && <button type="button" className="button button-primary tryout-check-answer" disabled={flow.submitting} onClick={() => navigateTryOut(index, true)}>Periksa Jawaban</button>}{onBack && <button type="button" className="button button-secondary" disabled={flow.busy} onClick={() => { if (!tryoutExperience) { onBack(); return; } setExamAction("exit"); actionDialog.current?.showModal(); }}>Keluar Sesi</button>}</div>}</> : <span role="status">{saveStatus}</span>}

        </aside>

        </QuestionPanel>

      </div>

    </div>

  );

}



function PracticeElapsedTimer({ startedAt }: { startedAt?: string }) {

  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {

    if (!startedAt || !Number.isFinite(Date.parse(startedAt))) return;

    const tick = () => setNow(Date.now());

    tick();

    const timer = window.setInterval(tick, 1000);

    return () => window.clearInterval(timer);

  }, [startedAt]);

  const seconds = startedAt && now !== null ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)) : null;

  if (seconds === null) return null;

  return <div className="checkpoint-timer" role="timer"><span><FiClock aria-hidden="true" /> Durasi berjalan</span><strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong></div>;

}
