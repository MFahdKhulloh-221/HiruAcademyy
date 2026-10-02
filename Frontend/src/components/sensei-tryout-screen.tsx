"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LuArrowLeft, LuArrowRight, LuBookOpen, LuCheck, LuChartNoAxesCombined, LuClock, LuFileCheck, LuFlag, LuGraduationCap, LuHeadphones, LuListOrdered, LuSpellCheck, LuTriangleAlert } from "react-icons/lu";
import { usePublishedAssessments, type PublishedAssessment } from "@/lib/assessment-store";
import { jlptTryoutSessions, tryoutConfig, tryoutLevels, tryoutQuestions, type TryoutLevel, type TryoutSession } from "@/lib/tryout-mock";

type View = "list" | "info" | "runner" | "result" | "review";
type Result = { id: number; total: number; sections: Record<TryoutSession, number>; answers: Record<string, string>; correct: number; answered: number };

const sessionIcons = [LuGraduationCap, LuSpellCheck, LuBookOpen, LuHeadphones];

export function SenseiTryoutScreen({ membership = "sensei" }: { membership?: "lms" | "sensei" }) {
  const published = usePublishedAssessments().filter((item) => item.type === "tryout");
  const [view, setView] = useState<View>("list");
  const [level, setLevel] = useState<TryoutLevel>("N4");
  const [assessment, setAssessment] = useState<PublishedAssessment>();
  const [session, setSession] = useState<TryoutSession>(jlptTryoutSessions[0]);
  const [question, setQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<string[]>([]);
  const [history, setHistory] = useState<Result[]>([]);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [reviewIncorrectOnly, setReviewIncorrectOnly] = useState(false);
  const sessions = assessment?.sections?.length === 4 && assessment.sections.every((name) => jlptTryoutSessions.includes(name as TryoutSession)) ? assessment.sections as TryoutSession[] : [...jlptTryoutSessions];
  const questions = assessment?.questions.filter((item) => item.section === session) ?? tryoutQuestions[session];
  const activeQuestion = questions[question];
  const currentResult = history.at(-1);
  const best = history.reduce((highest, item) => Math.max(highest, item.total), 0);
  const totalQuestions = assessment?.questions.length || 100;
  const sessionIndex = sessions.indexOf(session);
  const globalQuestion = assessment ? assessment.questions.findIndex((item) => item.id === activeQuestion?.id) + 1 : sessionIndex * 25 + question + 1;

  const catalog = useMemo(() => {
    const fixtures = tryoutLevels.map((item) => ({ id: `tryout-${item.toLowerCase()}`, level: item, title: `Try Out ${item} — Simulasi`, description: "Simulasi penuh dengan format Try Out dan review jawaban lengkap." }));
    return [...fixtures, ...published.map((item) => ({ id: item.id, level: item.level as TryoutLevel, title: item.title, description: "Simulasi terbit dari pengaturan admin.", assessment: item }))];
  }, [published]);

  function correctAnswer(questionId: string) {
    const item = questions.find((candidate) => candidate.id === questionId);
    return assessment?.answerKey[questionId] ?? (item && "correctOptionId" in item ? item.correctOptionId : "");
  }

  function start() {
    setSession(sessions[0]);
    setQuestion(0);
    setAnswers({});
    setMarked([]);
    setSubmitConfirm(false);
    setView("runner");
  }

  function finish() {
    let correct = 0;
    let answered = 0;
    const sections = Object.fromEntries(sessions.map((name) => {
      const items = assessment?.questions.filter((item) => item.section === name) ?? tryoutQuestions[name];
      const sectionCorrect = items.filter((item) => {
        if (answers[item.id]) answered++;
        const answer = assessment?.answerKey[item.id] ?? ("correctOptionId" in item ? item.correctOptionId : "");
        const isCorrect = answers[item.id] === answer;
        if (isCorrect) correct++;
        return isCorrect;
      }).length;
      return [name, Math.round((sectionCorrect / Math.max(items.length, 1)) * 45)];
    })) as Record<TryoutSession, number>;
    setHistory((items) => [...items, { id: Date.now(), sections, total: Object.values(sections).reduce((sum, score) => sum + score, 0), answers: { ...answers }, correct, answered }]);
    setSubmitConfirm(false);
    setView("result");
  }

  if (view === "runner" && activeQuestion) return <div className="sensei-tryout tryout-runner tryout-clean-focus">
    <header className="tryout-focus-header"><div><h1>Soal {globalQuestion} dari {totalQuestions}</h1><p>Try Out {level} • {session}</p></div><div className="tryout-focus-timer"><span>Timer</span><strong>125:00</strong><small>Sisa waktu sesi</small></div></header>
    <div className="tryout-focus-status"><span><strong>{Object.keys(answers).length}/{totalQuestions}</strong> Dijawab</span><i aria-hidden="true" /><span><strong>{marked.length}</strong> Ditandai</span><i aria-hidden="true" /><span>Auto-save Aktif</span></div>
    <div className="tryout-focus-layout"><main><section className="tryout-focus-question"><p className="dash-kicker">BAGIAN {session.toUpperCase()} • SOAL {globalQuestion}</p><h2>{activeQuestion.prompt}</h2><p className="tryout-question-japanese">{activeQuestion.japanese?.text}</p><fieldset><legend className="sr-only">Pilih satu jawaban</legend>{activeQuestion.options.map((option, index) => <label className={answers[activeQuestion.id] === option.id ? "selected" : ""} key={option.id}><input type="radio" name="tryout-answer" checked={answers[activeQuestion.id] === option.id} onChange={() => setAnswers((items) => ({ ...items, [activeQuestion.id]: option.id }))} /><span className="tryout-option-letter">{String.fromCharCode(65 + index)}</span><span>{option.label}</span></label>)}</fieldset></section><div className="tryout-focus-actions"><button type="button" onClick={() => setQuestion((value) => Math.max(0, value - 1))} disabled={!question}>Sebelumnya</button><button className={marked.includes(activeQuestion.id) ? "marked" : ""} type="button" onClick={() => setMarked((items) => items.includes(activeQuestion.id) ? items.filter((id) => id !== activeQuestion.id) : [...items, activeQuestion.id])}><LuFlag aria-hidden="true" /> Tandai Soal</button><button type="button" onClick={() => setQuestion((value) => Math.min(questions.length - 1, value + 1))} disabled={question === questions.length - 1}>Selanjutnya</button></div></main><aside className="tryout-focus-navigator"><p className="dash-kicker">NAVIGATOR SOAL</p><strong>{Object.keys(answers).length} dijawab • {marked.length} ditandai</strong><div className="tryout-number-grid">{questions.map((item, index) => <button aria-current={index === question ? "step" : undefined} aria-label={`Soal ${sessionIndex * 25 + index + 1}`} className={`${index === question ? "active" : ""} ${answers[item.id] ? "answered" : ""}`} type="button" onClick={() => setQuestion(index)} key={item.id}>{sessionIndex * 25 + index + 1}</button>)}</div><div className="tryout-range"><span>Sesi</span>{sessions.map((name) => <button className={session === name ? "active" : ""} type="button" onClick={() => { setSession(name); setQuestion(0); }} key={name}>{name}</button>)}</div><button className="tryout-submit" type="button" onClick={() => setSubmitConfirm(true)}>Selesaikan Try Out</button><button type="button" onClick={() => setView("list")}>Keluar Sesi</button></aside></div>
    {submitConfirm && <div className="tryout-submit-modal"><section role="dialog" aria-modal="true" aria-labelledby="tryout-submit-title"><h2 id="tryout-submit-title">Selesaikan Try Out?</h2><p>{totalQuestions - Object.keys(answers).length} dari {totalQuestions} soal belum dijawab.</p><small>Setelah dikirim, jawaban tidak dapat diubah pada hasil ini.</small><div><button type="button" onClick={() => setSubmitConfirm(false)}>Kembali Mengerjakan</button><button type="button" onClick={finish}>Kirim</button></div></section></div>}
  </div>;

  if (view === "result" && currentResult) {
    const config = tryoutConfig[level];
    const passed = currentResult.total >= config.totalPassingScore && sessions.every((name) => currentResult.sections[name] >= config.sectionPassingScore);
    const weakest = sessions.reduce((lowest, name) => currentResult.sections[name] < currentResult.sections[lowest] ? name : lowest, sessions[0]);
    return <div className="sensei-tryout tryout-result-report"><header className="tryout-result-header"><h1>Hasil Try Out</h1></header><section className="tryout-score-report"><div className="tryout-section-scores"><h2><span>得点区分別得点</span><small>Scores by Scoring Section</small></h2>{sessions.map((name) => <article key={name}><div><strong>{name}</strong><small>Hasil sesi Try Out</small></div><b>{currentResult.sections[name]} / 45</b></article>)}</div><div className="tryout-total-score"><span>総合得点</span><small>Total Score</small><strong>{currentResult.total}</strong><em>/ 180</em><b>{passed ? "LULUS" : "TIDAK LULUS"}</b></div></section><section className="tryout-lower-grid"><section className="tryout-reference-info"><h2>Reference Information</h2><dl><div><dt>Jawaban Benar</dt><dd>{currentResult.correct}</dd></div><div><dt>Jawaban Salah</dt><dd>{currentResult.answered - currentResult.correct}</dd></div><div><dt>Tidak Dijawab</dt><dd>{totalQuestions - currentResult.answered}</dd></div><div><dt>Waktu Pengerjaan</dt><dd>Belum direkam</dd></div><div><dt>Best Score</dt><dd>{best} / 180</dd></div></dl></section><aside className="tryout-recommendation"><h2>Rekomendasi Belajar</h2><h3>Fokus utama: {weakest}</h3><p>Review bagian dengan skor terendah dan tinjau kembali jawaban yang belum tepat.</p><ul><li>Review Kosakata</li><li>Kumpulan Flashcard</li><li><button type="button" onClick={() => { setReviewIncorrectOnly(true); setView("review"); }}>Review jawaban yang salah</button></li></ul><Link className="button button-primary" href={`/learn/${level.toLowerCase()}/chapter-1?membership=${membership}`}>Buka Materi Terkait <LuArrowRight aria-hidden="true" /></Link></aside></section><div className="tryout-result-actions"><button className="button button-secondary" type="button" onClick={() => setView("list")}><LuArrowLeft aria-hidden="true" /> Kembali ke Daftar Try Out</button><button className="button button-secondary" type="button" onClick={start}>Coba Lagi</button><button className="button button-primary" type="button" onClick={() => { setReviewIncorrectOnly(false); setView("review"); }}>Review Jawaban <LuArrowRight aria-hidden="true" /></button></div></div>;
  }

  if (view === "review" && currentResult) {
    const reviewQuestions = reviewIncorrectOnly ? questions.filter((item) => currentResult.answers[item.id] !== correctAnswer(item.id)) : questions;
    const reviewQuestion = reviewQuestions[Math.min(question, Math.max(reviewQuestions.length - 1, 0))];
    const expected = reviewQuestion ? correctAnswer(reviewQuestion.id) : "";
    const selected = reviewQuestion ? currentResult.answers[reviewQuestion.id] : "";
    const status = !selected ? "Tidak Dijawab" : selected === expected ? "Benar" : "Salah";
    return <div className="sensei-tryout tryout-review"><header><div><p className="dash-kicker">TRY OUT {level} • ULASAN</p><h1>Tinjau jawaban dan pembahasan</h1></div></header><div className="tryout-review-filters"><button className={!reviewIncorrectOnly ? "active" : ""} type="button" onClick={() => { setReviewIncorrectOnly(false); setQuestion(0); }}>SEMUA</button><button className={reviewIncorrectOnly ? "active" : ""} type="button" onClick={() => { setReviewIncorrectOnly(true); setQuestion(0); }}>SALAH / TIDAK DIJAWAB</button>{sessions.map((name) => <button className={session === name ? "active" : ""} type="button" onClick={() => { setSession(name); setQuestion(0); }} key={name}>{name}</button>)}</div><div className="tryout-review-layout"><aside><h2>DAFTAR SOAL</h2>{reviewQuestions.map((item, index) => <button className={question === index ? "active" : ""} type="button" onClick={() => setQuestion(index)} key={item.id}>Soal {sessions.indexOf(session) * 25 + questions.indexOf(item) + 1}</button>)}</aside><main>{reviewQuestion ? <><p className="dash-kicker">SOAL {sessions.indexOf(session) * 25 + questions.indexOf(reviewQuestion) + 1} • {session}</p><h2>{reviewQuestion.japanese?.text || reviewQuestion.prompt}</h2><div><strong>{status}</strong></div><div>Jawaban user: {reviewQuestion.options.find((item) => item.id === selected)?.label || "Tidak dijawab"}</div><div><LuCheck aria-hidden="true" /> Jawaban benar: {reviewQuestion.options.find((item) => item.id === expected)?.label}</div>{reviewQuestion.explanation && <section className="tryout-review-placeholder"><p>{reviewQuestion.explanation}</p></section>}</> : <section className="tryout-review-placeholder"><p>Tidak ada jawaban salah pada sesi ini.</p></section>}</main></div><div className="learning-question-actions"><button className="button button-secondary" type="button" onClick={() => setView("result")}>Kembali ke Hasil</button></div></div>;
  }

  if (view === "info") return <div className="sensei-tryout tryout-prestart"><button className="sensei-back" type="button" onClick={() => setView("list")}>&larr; Kembali ke Daftar</button><div className="tryout-prestart-layout"><main><section className="tryout-prestart-info"><p className="dash-kicker">INFORMASI SIMULASI</p><h1>{assessment?.title ?? `Try Out ${level}`}</h1><p>Try Out menggunakan timer dan dapat diulang tanpa batas. Hasil terbaik tetap tersimpan.</p><div className="tryout-info-tiles"><div><LuClock aria-hidden="true" /><strong>{assessment?.durationMinutes ?? 125} Menit</strong><span>Total Waktu</span></div><div><LuListOrdered aria-hidden="true" /><strong>4 Sesi</strong><span>Pembagian</span></div><div><LuChartNoAxesCombined aria-hidden="true" /><strong>{assessment?.maxScore ?? 180} Poin</strong><span>Skor Maksimal</span></div><div><LuFileCheck aria-hidden="true" /><strong>Review Mode</strong><span>Tersedia</span></div></div></section><div className="tryout-prestart-warning"><strong><LuTriangleAlert aria-hidden="true" /> Peringatan</strong><p>Timer dimulai setelah tombol Mulai Try Out ditekan.</p></div></main><aside className="tryout-prestart-sidebar"><section className="tryout-sections"><h2>Materi Sesi</h2>{sessions.map((name, index) => { const Icon = sessionIcons[index]; return <div key={name}><Icon aria-hidden="true" /><strong>{name}</strong><small>{assessment?.questions.filter((item) => item.section === name).length ?? 25} soal</small></div>; })}</section><button className="tryout-start-button" type="button" onClick={start}>Mulai Try Out <LuArrowRight aria-hidden="true" /></button></aside></div></div>;

  return <div className="sensei-tryout"><header className="tryout-page-header"><div><h1>Try Out</h1><p>Simulasikan ujian sebelum ujian sebenarnya.</p></div><label className="tryout-level-select">Pilih Level<select aria-label="Pilih Level Try Out" value={level} onChange={(event) => setLevel(event.target.value as TryoutLevel)}>{tryoutLevels.map((item) => <option key={item}>{item}</option>)}</select></label></header><section className="tryout-catalog"><div className="tryout-catalog-toolbar"><h2>Simulasi yang tersedia</h2></div><div>{catalog.filter((item) => item.level === level).map((item, index) => <article className="tryout-card" key={item.id}><div className="tryout-card-number">{String(index + 1).padStart(2, "0")}</div><div className="tryout-card-main"><header className="tryout-card-header"><h3>{item.title}</h3><span className="tryout-status-badge status-tersedia">TERSEDIA</span></header><p>{item.description}</p><div className="tryout-card-meta"><span>4 sesi • Bisa diulang tanpa batas</span></div></div><footer><button type="button" onClick={() => { setAssessment("assessment" in item ? item.assessment as PublishedAssessment : undefined); setView("info"); }}>Mulai Try Out</button></footer></article>)}</div></section></div>;
}
