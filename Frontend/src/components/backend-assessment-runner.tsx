"use client";

import { PlacementRichText } from "@/components/placement-rich-text";

import { Fragment, useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useAssessmentAttempt } from "@/components/assessment-hooks";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useLearningRequest } from "@/components/learning-hooks";
import { apiRequest } from "@/lib/api";
import { FiClock, FiList, FiBarChart2, FiFileText, FiAlertTriangle, FiBookOpen, FiHeadphones, FiCheckSquare, FiArrowLeft, FiArrowRight } from "react-icons/fi";
import "./assessment-layout.css";
import "./answer-review.css";
import { assessmentSessions, assessmentSessionLabels, tryOutRemaining, type AttemptDomain } from "@/lib/assessment-attempt";

export function BackendAssessmentRunner({ path, domain = "learning", title, startBody = {}, className = "learning-question-page", onComplete, onBack, scope, autoStart = false, startActions }: { startActions?: (busy: boolean) => ReactNode; onBack?: () => void; autoStart?: boolean; scope?: string; path: string; domain?: AttemptDomain; title: string; startBody?: object; className?: string; onComplete?: () => void }) {
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
  const [confirming, setConfirming] = useState<false | "sync" | "submit">(false);
  const checkHeading = useRef<HTMLHeadingElement>(null);
  const finalSubmission = useRef(false);
  const [reviewing, setReviewing] = useState(false);
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
    if (check) url.searchParams.set("tryout_stage", "check");
    else url.searchParams.delete("tryout_stage");
    if (questions[position]) url.searchParams.set("tryout_question", String(questions[position].id));
    else url.searchParams.delete("tryout_question");
    window.history.pushState(null, "", url);
  }
  function setIndex(value: number | ((previous: number) => number)) {
    navigateTryOut(typeof value === "function" ? value(index) : value);
  }
  const restoreTryOut = useEffectEvent(() => {
    const params = new URLSearchParams(window.location.search);
    const position = questions.findIndex(item => String(item.id) === params.get("tryout_question"));
    setQuestionIndex(Math.max(0, position));
    setChecking(params.get("tryout_stage") === "check");
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
      const warning = unanswered > 0 ? `\n\nMasih ada ${unanswered} soal yang belum dijawab. Kamu tetap dapat menyelesaikan ${examName}, tetapi soal yang kosong akan dihitung sebagai tidak benar.` : "";
      if (window.confirm(`Selesaikan Kuis? Jawaban akan dikumpulkan secara final dan tidak dapat diubah.${warning}`)) {
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
  const tryOutTimer = tryoutExperience && remaining !== null ? <div className="checkpoint-timer" role="timer"><span>TIMER</span><strong>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</strong><small>Sisa waktu ujian</small></div> : null;
  if (flow.loadingAttempt) return <section className={className}><LoadingSkeleton variant="assessment" label="Memuat…" /></section>;
  if (!attempt && tryoutExperience) return <section className="tryout-prestart"><div className="tryout-prestart-layout"><section className="tryout-prestart-info"><p className="dash-kicker">INFORMASI SIMULASI</p><h1>{title}</h1><div className="tryout-info-tiles"><div><FiClock aria-hidden="true" /><strong>{info.data?.duration_minutes == null ? "—" : `${info.data.duration_minutes} Menit`}</strong><span>Total Waktu</span></div><div><FiList aria-hidden="true" /><strong>{info.data ? Object.keys(info.data.sessions).length : "—"}</strong><span>Pembagian</span></div><div><FiBarChart2 aria-hidden="true" /><strong>{info.data?.max_score ?? "—"}</strong><span>Skor Maksimal</span></div><div><FiCheckSquare aria-hidden="true" /><strong>Review Mode</strong><span>Tersedia: —</span></div></div></section><section className="tryout-sections"><h2>Materi Sesi</h2>{Object.entries(info.data?.sessions ?? {}).map(([code, label]) => { const Icon = code === "audio" ? FiHeadphones : code === "reading" ? FiBookOpen : code === "grammar" ? FiFileText : FiList; return <div key={code}><Icon aria-hidden="true" /><strong><PlacementRichText value={label} /></strong></div>; })}</section><section className="assessment-warning"><h2><FiAlertTriangle aria-hidden="true" />Peringatan</h2><p>{info.data?.duration_minutes != null ? `Pengerjaan dibatasi ${info.data.duration_minutes} menit sesuai durasi yang ditampilkan. Waktu berjalan sejak ${examName} dimulai.` : "Ikuti informasi waktu yang ditampilkan saat pengerjaan."}</p><p>Pastikan koneksi internet stabil. Periksa jawaban sebelum menyelesaikan kuis. Setelah submit final, jawaban tidak dapat diubah; gunakan Review Jawaban pada hasil untuk memeriksa jawaban.</p></section><div className="tryout-prestart-action">{startActions?.(flow.busy)}{onBack && <button className="button button-secondary" type="button" disabled={flow.busy} onClick={onBack}>Kembali</button>}{flow.error && <p role="alert">{flow.error}</p>}<button className="button button-primary" type="button" disabled={flow.busy} onClick={() => void flow.start(startBody)}>Mulai {examName}</button></div>{info.error && <p className="tryout-prestart-error" role="alert">{info.error}</p>}</div></section>;
  if (!attempt) return <section className={className}><header className="learning-question-head"><h1>{title}</h1></header>{flow.error && <p role="alert">{flow.error}</p>}<button className="button button-primary" type="button" disabled={flow.busy || domain === "placement"} onClick={() => void flow.start(startBody)}>Mulai</button></section>;
  if (tryoutExperience && attempt.status === "completed" && result && !reviewing) return (
    <section className="tryout-result-page">
      <header className="tryout-result-header"><h1>Hasil {title}</h1><p>Ringkasan hasil pengerjaan simulasi</p></header>
      {flow.error && <p role="alert">{flow.error}</p>}
      <section className="tryout-result-score">
        <div className="tryout-result-details">
          <h2>RINCIAN SKOR</h2>
          <div className="tryout-result-sessions">{result.sessions?.map(section => (
            <article key={section.code}>
              <h3>{assessmentSessionLabels[assessmentSessions.findIndex(code => code === section.code)] ?? section.label}</h3>
              <div><span>Nilai Section</span><strong>{section.passing_score_basis === "points" ? section.earned : section.correct} / {section.passing_score_basis === "points" ? section.max : section.correct + section.wrong + section.unanswered}</strong></div>
              {domain !== "checkpoint" && <small>Passing score: {section.passing_score} • {section.passing_score_basis === "points" ? "Skor" : "Jawaban benar"}</small>}
              {domain !== "checkpoint" && <span className="tryout-result-pass">{section.pass ? "LULUS" : "BELUM LULUS"}</span>}
            </article>
          ))}</div>
        </div>
        <div className="tryout-result-total"><h2>TOTAL SKOR</h2><strong>{result.earned ?? result.correct}</strong><span>/ {result.max ?? result.correct + result.wrong + result.unanswered}</span><p>{passed === true ? "LULUS" : passed === false ? "BELUM LULUS" : "—"}</p></div>
      </section>
      <div className="tryout-result-info-grid">
        <section className="tryout-result-reference"><h2>REFERENCE INFORMATION</h2><dl><div><dt>Jawaban Benar</dt><dd>{result.correct}</dd></div><div><dt>Jawaban Salah</dt><dd>{result.wrong}</dd></div><div><dt>Tidak Dijawab</dt><dd>{result.unanswered}</dd></div></dl></section>
        <section className="tryout-result-recommendation"><h2>REKOMENDASI BELAJAR</h2><p>{result.recommendation_level ?? "—"}</p></section>
      </div>
      <div className="tryout-result-actions">
        {onBack && <button className="button button-secondary tryout-result-back" type="button" onClick={onBack}><FiArrowLeft aria-hidden="true" />Kembali ke Daftar</button>}
        <button className="button button-secondary tryout-result-retry" type="button" disabled={flow.busy} onClick={() => { setIndex(0); void flow.start(startBody); }}>Ulangi {examName}</button>
        <button className="button button-primary tryout-result-review" type="button" disabled={flow.busy} onClick={async () => { if (await flow.review()) { setIndex(0); setReviewing(true); } }}>Review Jawaban<FiArrowRight aria-hidden="true" /></button>
      </div>
    </section>
  );
  if (attempt.status === "completed" && result && !reviewing) return <section className="checkpoint-result tryout-result-report"><h1>Hasil {title}</h1>{flow.error && <p role="alert">{flow.error}</p>}<div className="checkpoint-result-stats"><div><span>Skor</span><strong>{result.earned ?? result.percentage ?? "—"}{result.max !== undefined ? ` / ${result.max}` : ""}</strong></div><div><span>Jawaban benar</span><strong>{result.correct}</strong></div><div><span>Tidak Dijawab</span><strong>{result.unanswered}</strong></div></div>{result.sessions && <section className="tryout-section-scores">{result.sessions.map(section => <article key={section.code}><strong>{tryoutExperience ? assessmentSessionLabels[assessmentSessions.findIndex(code => code === section.code)] ?? section.label : section.label}</strong><b>{section.earned} / {section.max}</b><small>Passing score: {section.passing_score} • {section.passing_score_basis === "points" ? "Skor" : "Jawaban benar"}</small>{(!tryoutExperience || result.total_passing_score != null) && <span>{section.pass ? "LULUS" : "TIDAK LULUS"}</span>}</article>)}</section>}{(!tryoutExperience || result.total_passing_score != null) && <p>{passed === true ? "LULUS" : passed === false ? "TIDAK LULUS" : "—"}</p>}<section className="checkpoint-recommendation"><p className="dash-kicker">REKOMENDASI</p><p>{isReading ? "Data topik bacaan belum cukup untuk memberikan rekomendasi belajar." : result.recommendation_level ?? "—"}</p></section>{domain !== "placement" && <button className="button button-secondary" type="button" disabled={flow.busy} onClick={async () => { if (await flow.review()) { setIndex(0); setReviewing(true); } }}>Review Jawaban</button>}<button className="button button-secondary" type="button" disabled={flow.busy} onClick={() => { setIndex(0); void flow.start(startBody); }}>Coba Lagi</button></section>;
  if (tryoutExperience && attempt.status === "in_progress" && checking) {
    const answered = questions.filter(item => Boolean(flow.answers[item.id])).length;
    const unanswered = questions.length - answered;
    return <section className="tryout-answer-check" aria-busy={Boolean(confirming)}>
      <header><h1 ref={checkHeading} tabIndex={-1}>Periksa Jawaban</h1><p>{title} • Attempt {attempt.id}</p><p>Total Soal: {questions.length} • Terjawab: {answered} • Belum Dijawab: {unanswered}</p></header>
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
      <footer className="tryout-check-actions"><button type="button" className="button button-primary" aria-busy={Boolean(confirming)} disabled={Boolean(confirming) || flow.submitting} onClick={() => void finishTryOut()}>{confirming === "sync" ? "Menyinkronkan…" : confirming === "submit" ? "Mengumpulkan…" : "Selesaikan Kuis"}</button><button type="button" className="button button-secondary" disabled={Boolean(confirming)} onClick={() => navigateTryOut(index)}>Kembali ke Soal</button></footer>
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
  const saveStatus = flow.busy ? "Menyimpan…" : flow.error ? "—" : "Tersimpan";
  const answerReview = reviewing && attempt.status === "completed";
  const QuestionPanel = isReading ? "div" : Fragment;
  return (
    <div className={tryoutExperience ? `${className} tryout-runner-polished` : className}>
      <header className="learning-question-head">
        {tryoutExperience ? <><h1>{reviewing ? "Review Jawaban · " : ""}Soal {Math.min(index + 1, questions.length)} dari {questions.length}</h1><p>{title}{sessionLabel ? ` • ${sessionLabel}` : ""}</p><p className="tryout-runner-status">{questions.filter(item => flow.answers[item.id]).length} / {questions.length} Terjawab<span role="status">{saveStatus}</span></p></> : <h1>{answerReview ? `Review Jawaban ? ${title}` : title}</h1>}
        {tryOutTimer}
        {!tryoutExperience && remaining !== null && (
          <div className="checkpoint-timer" role="timer">
            <span>Waktu tersisa</span>
            <strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong>
          </div>
        )}
      </header>
      {flow.error && <p role="alert">{flow.error}<button type="button" disabled={flow.busy} onClick={() => void (tryoutExperience && remaining === 0 ? flow.expire() : scope && remaining === 0 ? flow.submit() : flow.retrySave())}>Coba Lagi</button></p>}
      {answerReview && <p className="answer-review-legend">Keterangan: Jawaban benar (hijau) · Jawaban kamu salah (merah) · Tidak dijawab</p>}
      <div className={["learning-question-layout", answerReview && "answer-review", isReading && "reading-panels"].filter(Boolean).join(" ")}>
        {isReading && question && <section className="reading-passage" key={question.passage?.id ?? JSON.stringify(question.passage ?? question.reading_passage ?? null)} aria-label="Teks bacaan" tabIndex={0}>
          {question.instruction && <p className="reading-instruction"><PlacementRichText value={question.instruction} /></p>}
          {question.passage ? <><h2><PlacementRichText value={question.passage.title} /></h2><p><PlacementRichText value={question.passage.body} /></p></> : question.reading_passage && <p><PlacementRichText value={question.reading_passage} /></p>}
        </section>}
        <QuestionPanel>
        <main>
          {question && (
            <section className="learning-question-card">
              <p className="dash-kicker">{tryoutExperience ? <>{sessionLabel && <span>{sessionLabel}</span>}<span>Soal {sessionPosition + 1}</span></> : <>SOAL {Math.min(index + 1, questions.length)} DARI {questions.length}</>}</p>
              {!isReading && question.passage && <section className="reading-passage"><h2><PlacementRichText value={question.passage.title} /></h2><p><PlacementRichText value={question.passage.body} /></p></section>}
              {!isReading && question.reading_passage && <p><PlacementRichText value={question.reading_passage} /></p>}
              {(question.audio_url_resolved_url === undefined ? question.audio_url : question.audio_url_resolved_url) ? (
                <audio controls src={(question.audio_url_resolved_url === undefined ? question.audio_url : question.audio_url_resolved_url) || undefined} aria-label={question.title ?? "Audio"} />
              ) : question.audio_url ? <p role="status">Audio belum tersedia.</p> : null}
              {!isReading && question.instruction && <p><PlacementRichText value={question.instruction} /></p>}
              <h2><PlacementRichText value={question.question ?? question.prompt ?? ""} /></h2>
              {question.japanese?.text && <p lang="ja"><ruby>{question.japanese.text}{question.japanese.reading && <rt>{question.japanese.reading}</rt>}</ruby></p>}
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
                {!isLast && <button className="button button-secondary" type="button" onClick={() => setIndex(value => value + 1)}>Selanjutnya</button>}
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
                    Selanjutnya
                  </button>
                )}
                {tryoutExperience && isLast && questions.length > 0 && <button type="button" className="button button-primary" disabled={flow.submitting} onClick={() => navigateTryOut(index, true)}>Periksa Jawaban</button>}
                {!tryoutExperience && isLast && questions.length > 0 && (
                  <button type="button" className="button button-primary" disabled={flow.busy || Boolean(flow.error) || !allAnswered} onClick={() => void flow.submit()}>
                    Kumpulkan Jawaban
                  </button>
                )}
              </>
            )}
          </div>
        </main>
        <aside className="learning-question-sidebar">
          <nav aria-label="Navigasi soal">
            {tryoutExperience && <h2>NAVIGATOR SOAL</h2>}
            <div>
              {navigatorQuestions.map(item => {
                const position = questions.findIndex(question => question.id === item.id);
                return <button
                  type="button"
                  key={item.id}
                  aria-label={`Soal ${position + 1}`}
                  aria-current={position === index ? "step" : undefined}
                  className={tryoutExperience ? [position === index ? "active" : "", flow.answers[item.id] ? "answered" : ""].filter(Boolean).join(" ") : position === index ? "active" : flow.answers[item.id] ? "answered" : ""}
                  onClick={() => setIndex(position)}
                >
                  {position + 1}
                </button>;
              })}
            </div>
            {tryoutExperience && sessionQuestions.length > 25 && <footer className="tryout-navigator-pages"><button type="button" aria-label="Halaman soal sebelumnya" disabled={navigatorPage === 0} onClick={() => setIndex(questions.findIndex(item => item.id === sessionQuestions[(navigatorPage - 1) * 25]?.id))}><FiArrowLeft aria-hidden="true" /></button><span>{navigatorPage + 1} / {Math.ceil(sessionQuestions.length / 25)}</span><button type="button" aria-label="Halaman soal selanjutnya" disabled={(navigatorPage + 1) * 25 >= sessionQuestions.length} onClick={() => setIndex(questions.findIndex(item => item.id === sessionQuestions[(navigatorPage + 1) * 25]?.id))}><FiArrowRight aria-hidden="true" /></button></footer>}
          </nav>
          {tryoutExperience ? <><h2>PILIH SESI</h2><div className="tryout-session-list">{assessmentSessions.map((session, position) => <button type="button" key={session} aria-pressed={sessionIndex === position} disabled={!questions.some(item => item.session === session)} onClick={() => setIndex(questions.findIndex(item => item.session === session))}>{assessmentSessionLabels[position]}</button>)}</div>{!reviewing && attempt.status !== "completed" && <div className="tryout-sidebar-actions">{questions.length > 0 && <button type="button" className="button button-primary" disabled={flow.submitting} onClick={() => navigateTryOut(index, true)}>Periksa Jawaban</button>}{onBack && <button type="button" className="button button-secondary" disabled={flow.busy} onClick={onBack}>Keluar Sesi</button>}</div>}</> : <span role="status">{saveStatus}</span>}
        </aside>
        </QuestionPanel>
      </div>
    </div>
  );
}
