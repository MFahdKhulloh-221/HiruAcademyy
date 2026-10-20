"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useAssessmentAttempt } from "@/components/assessment-hooks";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useLearningRequest } from "@/components/learning-hooks";
import { apiRequest } from "@/lib/api";
import { FiClock, FiList, FiBarChart2, FiFileText, FiAlertTriangle, FiBookOpen, FiHeadphones, FiCheckSquare, FiArrowLeft, FiArrowRight } from "react-icons/fi";
import "./assessment-layout.css";
import { assessmentSessions, assessmentSessionLabels, tryOutRemaining, type AttemptDomain } from "@/lib/assessment-attempt";

export function BackendAssessmentRunner({ path, domain = "learning", title, startBody = {}, className = "learning-question-page", onComplete, onBack, scope, autoStart = false }: { onBack?: () => void; autoStart?: boolean; scope?: string; path: string; domain?: AttemptDomain; title: string; startBody?: object; className?: string; onComplete?: () => void }) {
  const flow = useAssessmentAttempt(path, domain, scope);
  const loadInfo = useCallback((signal: AbortSignal) => domain === "tryout"
    ? apiRequest<{ data: { duration_minutes: number | null; max_score: number; sessions: Record<string, string> } }>(path.replace(/\/attempts$/, ""), { signal }).then(response => response.data)
    : Promise.resolve(undefined), [domain, path]);
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
  const questions = attempt?.questions ?? [];
  const question = questions[Math.min(index, Math.max(questions.length - 1, 0))];
  const sessionIndex = assessmentSessions.findIndex(session => session === question?.session);
  const sessionLabel = assessmentSessionLabels[sessionIndex];
  const sessionQuestions = domain === "tryout" ? questions.filter(item => item.session === question?.session) : questions;
  function navigateTryOut(position: number, check = false) {
    setQuestionIndex(position);
    setChecking(check);
    if (domain !== "tryout") return;
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
    if (domain !== "tryout" || !attempt?.id) return;
    const restore = () => restoreTryOut();
    const timer = window.setTimeout(restore, 0);
    window.addEventListener("popstate", restore);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", restore); };
  }, [domain, attempt?.id]);
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
      const warning = unanswered > 0 ? `\n\nMasih ada ${unanswered} soal yang belum dijawab. Kamu tetap dapat menyelesaikan Try Out, tetapi soal yang kosong akan dihitung sebagai tidak benar.` : "";
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
    if (domain === "tryout" || !attempt?.expires_at || attempt.status === "completed") return;
    const timer = window.setInterval(() => setNow(scope ? performance.now() : Date.now()), scope ? 250 : 1000);
    return () => window.clearInterval(timer);
  }, [domain, attempt?.expires_at, attempt?.status, scope]);
  useEffect(() => {
    if (attempt?.status === "completed") onComplete?.();
  }, [attempt?.id, attempt?.status, onComplete]);
  useEffect(() => {
    if (domain !== "tryout" || !attempt?.expires_at || attempt.status === "completed") return;
    const timer = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, [domain, attempt?.id, attempt?.expires_at, attempt?.status]);
  const remaining = domain === "tryout" && attempt ? tryOutRemaining(attempt, now) : domain !== "tryout" && attempt?.expires_at ? scope && attempt.server_now && attempt.request_started_at !== undefined && attempt.received_at !== undefined ? Math.max(0, Math.ceil((Date.parse(attempt.expires_at) - Date.parse(attempt.server_now) - Math.max(0, Math.max(now, attempt.received_at) - attempt.request_started_at)) / 1000)) : !scope && now ? Math.max(0, Math.ceil((Date.parse(attempt.expires_at) - now) / 1000)) : null : null;
  useEffect(() => {
    if (attempt?.status !== "in_progress" || remaining !== 0) return;
    if (domain === "tryout") {
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
  }, [remaining, flow, attempt?.status, attempt?.id, scope, domain]);
  const tryOutTimer = domain === "tryout" && remaining !== null ? <div className="checkpoint-timer" role="timer"><span>TIMER</span><strong>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</strong><small>Sisa waktu ujian</small></div> : null;
  if (flow.loadingAttempt) return <section className={className}><LoadingSkeleton variant="assessment" label="Memuat…" /></section>;
  if (!attempt && domain === "tryout") return <section className="tryout-prestart"><div className="tryout-prestart-layout"><section className="tryout-prestart-info"><p className="dash-kicker">INFORMASI SIMULASI</p><h1>{title}</h1><div className="tryout-info-tiles"><div><FiClock aria-hidden="true" /><strong>{info.data?.duration_minutes == null ? "—" : `${info.data.duration_minutes} Menit`}</strong><span>Total Waktu</span></div><div><FiList aria-hidden="true" /><strong>{info.data ? Object.keys(info.data.sessions).length : "—"}</strong><span>Pembagian</span></div><div><FiBarChart2 aria-hidden="true" /><strong>{info.data?.max_score ?? "—"}</strong><span>Skor Maksimal</span></div><div><FiCheckSquare aria-hidden="true" /><strong>Review Mode</strong><span>Tersedia: —</span></div></div></section><section className="tryout-sections"><h2>Materi Sesi</h2>{Object.entries(info.data?.sessions ?? {}).map(([code, label]) => { const Icon = code === "audio" ? FiHeadphones : code === "reading" ? FiBookOpen : code === "grammar" ? FiFileText : FiList; return <div key={code}><Icon aria-hidden="true" /><strong>{label}</strong></div>; })}</section><section className="assessment-warning"><h2><FiAlertTriangle aria-hidden="true" />Peringatan</h2><p>OPEN: ketersediaan review dan teks peringatan.</p></section><div className="tryout-prestart-action">{flow.error && <p role="alert">{flow.error}</p>}<button className="button button-primary" type="button" disabled={flow.busy} onClick={() => void flow.start(startBody)}>Mulai Try Out</button></div>{info.error && <p className="tryout-prestart-error" role="alert">{info.error}</p>}</div></section>;
  if (!attempt) return <section className={className}><header className="learning-question-head"><h1>{title}</h1></header>{flow.error && <p role="alert">{flow.error}</p>}<button className="button button-primary" type="button" disabled={flow.busy || domain === "placement"} onClick={() => void flow.start(startBody)}>Mulai</button></section>;
  if (domain === "tryout" && attempt.status === "completed" && result && !reviewing) return (
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
              <small>Passing score: {section.passing_score} • {section.passing_score_basis === "points" ? "Skor" : "Jawaban benar"}</small>
              <span className="tryout-result-pass">{section.pass ? "LULUS" : "BELUM LULUS"}</span>
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
        <button className="button button-secondary tryout-result-retry" type="button" disabled={flow.busy} onClick={() => { setIndex(0); void flow.start(startBody); }}>Ulangi Try Out</button>
        <button className="button button-primary tryout-result-review" type="button" disabled={flow.busy} onClick={async () => { if (await flow.review()) { setIndex(0); setReviewing(true); } }}>Review Jawaban<FiArrowRight aria-hidden="true" /></button>
      </div>
    </section>
  );
  if (attempt.status === "completed" && result && !reviewing) return <section className="checkpoint-result tryout-result-report"><h1>Hasil {title}</h1>{flow.error && <p role="alert">{flow.error}</p>}<div className="checkpoint-result-stats"><div><span>Skor</span><strong>{result.earned ?? result.percentage ?? "—"}{result.max !== undefined ? ` / ${result.max}` : ""}</strong></div><div><span>Jawaban benar</span><strong>{result.correct}</strong></div><div><span>Tidak Dijawab</span><strong>{result.unanswered}</strong></div></div>{result.sessions && <section className="tryout-section-scores">{result.sessions.map(section => <article key={section.code}><strong>{domain === "tryout" ? assessmentSessionLabels[assessmentSessions.findIndex(code => code === section.code)] ?? section.label : section.label}</strong><b>{section.earned} / {section.max}</b><small>Passing score: {section.passing_score} • {section.passing_score_basis === "points" ? "Skor" : "Jawaban benar"}</small>{(domain !== "tryout" || result.total_passing_score != null) && <span>{section.pass ? "LULUS" : "TIDAK LULUS"}</span>}</article>)}</section>}{(domain !== "tryout" || result.total_passing_score != null) && <p>{passed === true ? "LULUS" : passed === false ? "TIDAK LULUS" : "—"}</p>}<section className="checkpoint-recommendation"><p className="dash-kicker">REKOMENDASI</p><p>{result.recommendation_level ?? "—"}</p></section>{domain !== "placement" && <button className="button button-secondary" type="button" disabled={flow.busy} onClick={async () => { if (await flow.review()) { setIndex(0); setReviewing(true); } }}>Lihat Jawaban</button>}<button className="button button-secondary" type="button" disabled={flow.busy} onClick={() => { setIndex(0); void flow.start(startBody); }}>Coba Lagi</button></section>;
  if (domain === "tryout" && attempt.status === "in_progress" && checking) {
    const answered = questions.filter(item => Boolean(flow.answers[item.id])).length;
    const unanswered = questions.length - answered;
    return <section className="tryout-answer-check" aria-busy={Boolean(confirming)}>
      <header><h1 ref={checkHeading} tabIndex={-1}>Pemeriksaan Jawaban</h1><p>{title} • Attempt {attempt.id}</p><p>Total Soal: {questions.length} • Terjawab: {answered} • Belum Dijawab: {unanswered}</p></header>
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
      {unanswered > 0 && <p className="tryout-check-warning">Masih ada {unanswered} soal yang belum dijawab. Kamu tetap dapat menyelesaikan Try Out, tetapi soal yang kosong akan dihitung sebagai tidak benar.</p>}
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
  const navigatorQuestions = domain === "tryout" ? sessionQuestions.slice(navigatorPage * 25, (navigatorPage + 1) * 25) : sessionQuestions;
  const saveStatus = flow.busy ? "Menyimpan…" : flow.error ? "—" : "Tersimpan";
  return (
    <div className={domain === "tryout" ? `${className} tryout-runner-polished` : className}>
      <header className="learning-question-head">
        {domain === "tryout" ? <><h1>Soal {Math.min(index + 1, questions.length)} dari {questions.length}</h1><p>{title}{sessionLabel ? ` • ${sessionLabel}` : ""}</p><p className="tryout-runner-status">{questions.filter(item => flow.answers[item.id]).length} / {questions.length} Terjawab<span role="status">{saveStatus}</span></p></> : <h1>{title}</h1>}
        {tryOutTimer}
        {domain !== "tryout" && remaining !== null && (
          <div className="checkpoint-timer" role="timer">
            <span>Waktu tersisa</span>
            <strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong>
          </div>
        )}
      </header>
      {flow.error && <p role="alert">{flow.error}<button type="button" disabled={flow.busy} onClick={() => void (domain === "tryout" && remaining === 0 ? flow.expire() : scope && remaining === 0 ? flow.submit() : flow.retrySave())}>Coba Lagi</button></p>}
      <div className="learning-question-layout">
        <main>
          {question && (
            <section className="learning-question-card">
              <p className="dash-kicker">{domain === "tryout" ? <>{sessionLabel && <span>{sessionLabel}</span>}<span>Soal {sessionPosition + 1}</span></> : <>SOAL {Math.min(index + 1, questions.length)} DARI {questions.length}</>}</p>
              {question.passage && <section className="reading-passage"><h2>{question.passage.title}</h2><p>{question.passage.body}</p></section>}
              {question.reading_passage && <p>{question.reading_passage}</p>}
              {(question.audio_url_resolved_url || question.audio_url) && (
                <audio controls src={question.audio_url_resolved_url || question.audio_url || undefined} aria-label={question.title ?? "Audio"} />
              )}
              {question.instruction && <p>{question.instruction}</p>}
              <h2>{question.question ?? question.prompt}</h2>
              {question.japanese?.text && <p lang="ja"><ruby>{question.japanese.text}{question.japanese.reading && <rt>{question.japanese.reading}</rt>}</ruby></p>}
              <fieldset disabled={Boolean((scope || domain === "tryout") && remaining === 0) || reviewing || flow.submitting || (domain !== "tryout" && flow.busy) || attempt.status === "completed"}>
                <legend className="sr-only">Pilihan jawaban</legend>
                {Object.entries(question.options).map(([option, label]) => (
                  <label key={option} className={flow.answers[question.id] === option ? "selected" : ""}>
                    <input
                      type="radio"
                      name={`answer-${question.id}`}
                      checked={flow.answers[question.id] === option}
                      onChange={() => flow.answer(question.id, option)}
                    />
                    {domain === "tryout" ? <><span className="tryout-option-letter">{option}.</span>{" "}<span className="tryout-option-text">{label}</span></> : <span>{option}. {label}</span>}
                  </label>
                ))}
              </fieldset>
              {reviewing && (
                <section>
                  <p>Jawaban benar: {question.correct_option ? question.options[question.correct_option] : "—"}</p>
                  {question.explanation && <p>{question.explanation}</p>}
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
                {domain !== "tryout" && isLast && questions.length > 0 && (
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
            {domain === "tryout" && <h2>NAVIGATOR SOAL</h2>}
            <div>
              {navigatorQuestions.map(item => {
                const position = questions.findIndex(question => question.id === item.id);
                return <button
                  type="button"
                  key={item.id}
                  aria-label={`Soal ${position + 1}`}
                  aria-current={position === index ? "step" : undefined}
                  className={domain === "tryout" ? [position === index ? "active" : "", flow.answers[item.id] ? "answered" : ""].filter(Boolean).join(" ") : position === index ? "active" : flow.answers[item.id] ? "answered" : ""}
                  onClick={() => setIndex(position)}
                >
                  {position + 1}
                </button>;
              })}
            </div>
            {domain === "tryout" && sessionQuestions.length > 25 && <footer className="tryout-navigator-pages"><button type="button" aria-label="Halaman soal sebelumnya" disabled={navigatorPage === 0} onClick={() => setIndex(questions.findIndex(item => item.id === sessionQuestions[(navigatorPage - 1) * 25]?.id))}><FiArrowLeft aria-hidden="true" /></button><span>{navigatorPage + 1} / {Math.ceil(sessionQuestions.length / 25)}</span><button type="button" aria-label="Halaman soal selanjutnya" disabled={(navigatorPage + 1) * 25 >= sessionQuestions.length} onClick={() => setIndex(questions.findIndex(item => item.id === sessionQuestions[(navigatorPage + 1) * 25]?.id))}><FiArrowRight aria-hidden="true" /></button></footer>}
          </nav>
          {domain === "tryout" ? <><h2>PILIH SESI</h2><div className="tryout-session-list">{assessmentSessions.map((session, position) => <button type="button" key={session} aria-pressed={sessionIndex === position} disabled={!questions.some(item => item.session === session)} onClick={() => setIndex(questions.findIndex(item => item.session === session))}>{assessmentSessionLabels[position]}</button>)}</div>{!reviewing && attempt.status !== "completed" && <div className="tryout-sidebar-actions">{questions.length > 0 && <button type="button" className="button button-primary" disabled={flow.submitting} onClick={() => navigateTryOut(index, true)}>Selesaikan Try Out</button>}{onBack && <button type="button" className="button button-secondary" disabled={flow.busy} onClick={onBack}>Keluar Sesi</button>}</div>}</> : <span role="status">{saveStatus}</span>}
        </aside>
      </div>
    </div>
  );
}
