"use client";

import { useEffect, useState } from "react";
import { useAssessmentAttempt } from "@/components/assessment-hooks";
import { assessmentSessions, assessmentSessionLabels, type AttemptDomain } from "@/lib/assessment-attempt";

export function BackendAssessmentRunner({ path, domain = "learning", title, startBody = {}, className = "learning-question-page", onComplete }: { path: string; domain?: AttemptDomain; title: string; startBody?: object; className?: string; onComplete?: () => void }) {
  const flow = useAssessmentAttempt(path, domain);
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [now, setNow] = useState(0);
  const attempt = flow.attempt;
  const questions = attempt?.questions ?? [];
  const question = questions[Math.min(index, Math.max(questions.length - 1, 0))];
  const sessionIndex = assessmentSessions.findIndex(session => session === question?.session);
  const sessionLabel = assessmentSessionLabels[sessionIndex];
  const sessionQuestions = domain === "tryout" ? questions.filter(item => item.session === question?.session) : questions;
  const result = attempt?.result;
  useEffect(() => {
    if (domain === "tryout" || !attempt?.expires_at || attempt.status === "completed") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [domain, attempt?.expires_at, attempt?.status]);
  useEffect(() => {
    if (attempt?.status === "completed") onComplete?.();
  }, [attempt?.id, attempt?.status, onComplete]);
  const remaining = domain !== "tryout" && attempt?.expires_at && now ? Math.max(0, Math.ceil((Date.parse(attempt.expires_at) - now) / 1000)) : null;
  useEffect(() => {
    if (remaining === 0 && !flow.busy && !flow.error) void flow.submit();
  }, [remaining, flow]);
  if (!attempt && domain === "tryout") return <section className="tryout-prestart"><div className="tryout-prestart-layout"><section className="tryout-prestart-info"><p className="dash-kicker">INFORMASI SIMULASI</p><h1>{title}</h1><div className="tryout-info-tiles"><div><strong>125 Menit</strong><span>Total Waktu</span></div><div><strong>4 Sesi</strong><span>Pembagian</span></div><div><strong>180 Poin</strong><span>Skor Maksimal</span></div><div><strong>Review Mode</strong><span>Tersedia</span></div></div>{flow.error && <p role="alert">{flow.error}</p>}<button className="button button-primary" type="button" disabled={flow.busy} onClick={() => void flow.start(startBody)}>Mulai Try Out</button></section><aside className="tryout-prestart-sidebar"><section className="tryout-sections"><h2>Materi Sesi</h2>{assessmentSessionLabels.map(label => <div key={label}><strong>{label}</strong></div>)}</section></aside></div></section>;
  if (!attempt) return <section className={className}><header className="learning-question-head"><h1>{title}</h1></header>{flow.error && <p role="alert">{flow.error}</p>}<button className="button button-primary" type="button" disabled={flow.busy || domain === "placement"} onClick={() => void flow.start(startBody)}>Mulai</button></section>;
  if (attempt.status === "completed" && result && !reviewing) return <section className="checkpoint-result tryout-result-report"><h1>Hasil {title}</h1>{flow.error && <p role="alert">{flow.error}</p>}<div className="checkpoint-result-stats"><div><span>Skor</span><strong>{result.earned ?? result.percentage ?? "—"}{result.max !== undefined ? ` / ${result.max}` : ""}</strong></div><div><span>Jawaban benar</span><strong>{result.correct}</strong></div><div><span>Tidak Dijawab</span><strong>{result.unanswered}</strong></div></div>{result.sessions && <section className="tryout-section-scores">{result.sessions.map(section => <article key={section.code}><strong>{domain === "tryout" ? assessmentSessionLabels[assessmentSessions.findIndex(code => code === section.code)] ?? section.label : section.label}</strong><b>{section.earned} / {section.max}</b><small>Passing score: {section.passing_score}</small>{(domain !== "tryout" || result.total_passing_score != null) && <span>{section.pass ? "LULUS" : "TIDAK LULUS"}</span>}</article>)}</section>}{(domain !== "tryout" || result.total_passing_score != null) && <p>{result.overall_pass === true ? "LULUS" : result.overall_pass === false ? "TIDAK LULUS" : "—"}</p>}<section className="checkpoint-recommendation"><p className="dash-kicker">REKOMENDASI</p><p>{result.recommendation_level ?? "—"}</p></section>{domain !== "placement" && <button className="button button-secondary" type="button" disabled={flow.busy} onClick={async () => { if (await flow.review()) { setIndex(0); setReviewing(true); } }}>Lihat Jawaban</button>}<button className="button button-secondary" type="button" disabled={flow.busy} onClick={() => { setIndex(0); void flow.start(startBody); }}>Coba Lagi</button></section>;
  const isFirst = index === 0;
  const isLast = index >= questions.length - 1;
  const allAnswered = domain === "learning" && startBody && "kind" in startBody && startBody.kind !== "mini"
    ? Object.keys(flow.answers).length === questions.length
    : true;
  return (
    <div className={className}>
      <header className="learning-question-head">
        <h1>{title}{domain === "tryout" && sessionLabel ? ` • ${sessionLabel}` : ""}</h1>
        {domain === "tryout" && <p>Soal {Math.min(index + 1, questions.length)} dari {questions.length}</p>}
        {remaining !== null && (
          <div className="checkpoint-timer" role="timer">
            <span>Waktu tersisa</span>
            <strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong>
          </div>
        )}
      </header>
      {flow.error && <p role="alert">{flow.error}</p>}
      <div className="learning-question-layout">
        <main>
          {question && (
            <section className="learning-question-card">
              <p className="dash-kicker">SOAL {Math.min(index + 1, questions.length)} DARI {questions.length}</p>
              {question.passage && <section className="reading-passage"><h2>{question.passage.title}</h2><p>{question.passage.body}</p></section>}
              {question.reading_passage && <p>{question.reading_passage}</p>}
              {(question.audio_url_resolved_url || question.audio_url) && (
                <audio controls src={question.audio_url_resolved_url || question.audio_url || undefined} aria-label={question.title ?? "Audio"} />
              )}
              <h2>{question.question ?? question.prompt}</h2>
              <fieldset disabled={reviewing || flow.submitting || (domain !== "tryout" && flow.busy) || attempt.status === "completed"}>
                <legend className="sr-only">Pilihan jawaban</legend>
                {(domain === "tryout" ? ["A", "B", "C", "D"].map(option => [option, question.options[option]]) : Object.entries(question.options)).map(([option, label]) => (
                  <label key={option} className={flow.answers[question.id] === option ? "selected" : ""}>
                    <input
                      type="radio"
                      name={`answer-${question.id}`}
                      checked={flow.answers[question.id] === option}
                      onChange={() => flow.answer(question.id, option)}
                    />
                    <span>{option}. {label}</span>
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
                {isLast && questions.length > 0 && (
                  <button type="button" className="button button-primary" disabled={flow.busy || (domain !== "tryout" && Boolean(flow.error)) || !allAnswered} onClick={() => void flow.submit()}>
                    Kumpulkan Jawaban
                  </button>
                )}
              </>
            )}
          </div>
        </main>
        <aside className="learning-question-sidebar">
          {domain === "tryout" && <h2>NAVIGATOR SOAL</h2>}
          {domain === "tryout" && <div className="tryout-session-list">{assessmentSessions.map((session, position) => <button type="button" key={session} aria-pressed={sessionIndex === position} disabled={!questions.some(item => item.session === session)} onClick={() => setIndex(questions.findIndex(item => item.session === session))}>{assessmentSessionLabels[position]}</button>)}</div>}
          <nav aria-label="Navigasi soal">
            <div>
              {sessionQuestions.map((item, sessionPosition) => {
                const position = questions.findIndex(question => question.id === item.id);
                return <button
                  type="button"
                  key={item.id}
                  aria-label={`Soal ${position + 1}`}
                  aria-current={position === index ? "step" : undefined}
                  className={position === index ? "active" : flow.answers[item.id] ? "answered" : ""}
                  onClick={() => setIndex(position)}
                >
                  {domain === "tryout" ? sessionPosition + 1 : position + 1}
                </button>;
              })}
            </div>
          </nav>
          <span role="status">{flow.busy ? "Menyimpan…" : flow.error ? "—" : "Tersimpan"}</span>
        </aside>
      </div>
    </div>
  );
}
