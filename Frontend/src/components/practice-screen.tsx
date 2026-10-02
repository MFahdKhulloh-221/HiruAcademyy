"use client";

import { useEffect, useMemo, useState } from "react";
import { LuArrowLeft, LuArrowRight, LuBookOpen, LuCheck, LuClock, LuFlame, LuLock, LuPlay, LuRotateCcw, LuTarget, LuVolume2 } from "react-icons/lu";
import { StudentNavigation } from "@/components/student-navigation";
import { canAccessPracticeLevel, defaultPracticeLevel, getPracticeAnswerKey, getPracticeQuestions, historyKey, levelHasCategories, practiceCategories, practiceKey, practiceLevels, progressKey, type PracticeCategory, type PracticeDraft, type PracticeHistory, type PracticeLevel } from "@/lib/practice-mock";
import type { Membership } from "@/lib/dashboard-mock";
import { usePublishedAssessments } from "@/lib/assessment-store";

type Step = "list" | "runner" | "result" | "review";

function readSession<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    sessionStorage.removeItem(key);
    return fallback;
  }
}

export function PracticeScreen({ membership }: { membership: Membership }) {
  const [level, setLevel] = useState<PracticeLevel>(() => defaultPracticeLevel(membership));
  const [category, setCategory] = useState<PracticeCategory>("Kosakata");
  const [exercise, setExercise] = useState(1);
  const [step, setStep] = useState<Step>("list");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; correct: number; total: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const [history, setHistory] = useState<PracticeHistory[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PracticeDraft>>({});

  useEffect(() => {
    const resetList = () => setStep("list");
    window.addEventListener("hiru:practice-list", resetList);
    return () => window.removeEventListener("hiru:practice-list", resetList);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      const savedHistory = readSession<PracticeHistory[]>(historyKey(membership), []);
      if (savedHistory.length) {
        setHistory(savedHistory);
        setLevel(savedHistory[0].level);
        if (savedHistory[0].category) setCategory(savedHistory[0].category);
      }
      const savedDrafts = readSession<Record<string, PracticeDraft>>(progressKey(membership), {});
      setDrafts(savedDrafts);
    }, 0);
    return () => clearTimeout(timer);
  }, [membership]);
  const published = usePublishedAssessments();
  const activeCategory = levelHasCategories(level) ? category : undefined;
  const publishedExercises = useMemo(() => published.filter((item) => item.type === "practice" && item.level === level && item.category === activeCategory && item.exercise), [activeCategory, level, published]);
  const exerciseItems = useMemo(() => {
    const items = new Map<number, { exercise: number; title?: string; count: number }>([1, 2, 3, 4, 5].map((item) => [item, { exercise: item, count: getPracticeQuestions().length }]));
    publishedExercises.forEach((item) => items.set(item.exercise!, { exercise: item.exercise!, title: item.title, count: item.questions.length }));
    return [...items.values()].sort((a, b) => a.exercise - b.exercise);
  }, [publishedExercises]);
  const selectedAssessment = publishedExercises.find((item) => item.exercise === exercise);
  const questions = selectedAssessment?.questions.map((question) => ({ id: question.id, prompt: question.prompt, options: question.options.filter((option) => option.label.trim()).map((option) => ({ id: option.id, text: option.label })) })) ?? getPracticeQuestions();
  const answerKey = selectedAssessment ? Object.fromEntries(questions.map((question) => [question.id, question.options.findIndex((option) => option.id === selectedAssessment.answerKey[question.id])])) : getPracticeAnswerKey();
  const key = practiceKey(level, exercise, activeCategory);
  const current = questions[Math.min(questionIndex, Math.max(questions.length - 1, 0))];
  const latest = (item: number) => history.find((entry) => entry.level === level && entry.category === activeCategory && entry.exercise === item);

  const changeLevel = (value: PracticeLevel) => {
    setLevel(value);
    setCategory("Kosakata");
    setStep("list");
  };
  const start = (item: number) => {
    const nextKey = practiceKey(level, item, activeCategory);
    const draft = drafts[nextKey];
    setStep("runner");
    setExercise(item);
    setAnswers(draft?.answers ?? {});
    setQuestionIndex(Math.min(draft?.questionIndex ?? 0, questions.length - 1));
    setResult(null);
    setSecondsLeft(300);
    setStep("runner");
  };
  const saveAnswer = (answer: number) => {
    const nextAnswers = { ...answers, [current.id]: answer };
    const nextDrafts = { ...drafts, [key]: { key, answers: nextAnswers, questionIndex } };
    setAnswers(nextAnswers);
    setDrafts(nextDrafts);
    sessionStorage.setItem(progressKey(membership), JSON.stringify(nextDrafts));
  };
  const move = (nextIndex: number) => {
    const nextDrafts = { ...drafts, [key]: { key, answers, questionIndex: nextIndex } };
    setQuestionIndex(nextIndex);
    setDrafts(nextDrafts);
    sessionStorage.setItem(progressKey(membership), JSON.stringify(nextDrafts));
  };
  const submit = (submittedAt: number) => {
    const correct = questions.filter((question) => answers[question.id] === answerKey[question.id]).length;
    const next = { score: Math.round(correct / questions.length * 100), correct, total: questions.length };
    const item: PracticeHistory = { id: `${submittedAt}`, level, category: activeCategory, exercise, ...next, at: new Date(submittedAt).toISOString() };
    const nextHistory = [item, ...history];
    const nextDrafts = { ...drafts };
    delete nextDrafts[key];
    setHistory(nextHistory);
    setDrafts(nextDrafts);
    setResult(next);
    sessionStorage.setItem(historyKey(membership), JSON.stringify(nextHistory));
    sessionStorage.setItem(progressKey(membership), JSON.stringify(nextDrafts));
    setStep("result");
  };
  useEffect(() => {
    if (step !== "runner" || secondsLeft === 0) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [step, secondsLeft]);
  const average = history.length ? Math.round(history.reduce((sum, item) => sum + item.score, 0) / history.length) : 0;
  const time = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return <div className="supporting-shell student-shell"><StudentNavigation membership={membership} /><main className="supporting-main practice-page practice-flow">
    <nav className="practice-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => setStep("list")}>Latihan Harian</button><span aria-hidden="true">›</span><button type="button" onClick={() => setStep("list")}>{level}</button>{activeCategory && <><span aria-hidden="true">›</span>{step === "list" ? <strong aria-current="page">{activeCategory}</strong> : <button type="button" onClick={() => setStep("list")}>{activeCategory}</button>}</>}{!activeCategory && step === "list" && <strong className="sr-only" aria-current="page">{level}</strong>}{step !== "list" && <><span aria-hidden="true">›</span>{step === "runner" ? <strong aria-current="page">Latihan {exercise}</strong> : <button type="button" onClick={() => setStep("runner")}>Latihan {exercise}</button>}</>}{(step === "result" || step === "review") && <><span aria-hidden="true">›</span>{step === "result" ? <strong aria-current="page">Hasil</strong> : <button type="button" onClick={() => setStep("result")}>Hasil</button>}</>}{step === "review" && <><span aria-hidden="true">›</span><strong aria-current="page">Lihat Jawaban</strong></>}</nav>
    <header className="practice-header"><div><h1>Latihan Harian</h1><p>“Tingkatkan kemampuan bahasa Jepang Anda hari ini.”</p></div>{step === "list" && <label>Pilih Level<select value={level} onChange={(event) => changeLevel(event.target.value as PracticeLevel)}>{practiceLevels.map((item) => <option key={item}>{item}</option>)}</select></label>}</header>
    {step === "list" && <>
      <section className="practice-summary" aria-label="Ringkasan Latihan"><article><LuBookOpen /><div><span>Total Latihan</span><strong>{history.length}</strong></div></article><article><LuTarget /><div><span>Rata-rata Skor</span><strong>{average}%</strong></div></article><article><LuFlame /><div><span>Streak Hari Ini</span><strong>{history.length ? 1 : 0} hari</strong></div></article></section>
      {levelHasCategories(level) && <nav className="practice-category-tabs" aria-label="Pilih Kategori">{practiceCategories.map((item) => <button type="button" aria-pressed={category === item} className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</nav>}
      {!canAccessPracticeLevel(membership, level) ? <section className="practice-locked"><LuLock /><h2>Akses latihan terkunci</h2><p>Level ini belum termasuk dalam membership aktif.</p><a href={`/renewal?membership=${membership}`}>Upgrade</a></section> : <section className="practice-journey-list" aria-label="Daftar latihan">{exerciseItems.map((item) => { const score = latest(item.exercise); const draft = drafts[practiceKey(level, item.exercise, activeCategory)]; const status = score ? "Selesai" : draft ? "Dalam Progres" : "Belum Selesai"; return <article className={`practice-journey-card status-${status.toLowerCase().replace(" ", "-")}`} key={item.exercise}><div className="practice-journey-number">{String(item.exercise).padStart(2, "0")}</div><div className="practice-journey-copy"><div className="practice-journey-title"><h2>{item.title ?? `${level === "N5" ? "N5" : level} ${activeCategory ? `| ${activeCategory} ` : ""}| Latihan ${String(item.exercise).padStart(2, "0")}`}</h2><span className={`practice-status status-${status.toLowerCase().replace(" ", "-")}`}>{status}</span></div><p>{item.count} Soal</p><div className="practice-last-score"><span>Skor</span><strong>{score ? `${score.score}%` : item.exercise === 1 ? "80%" : "65%"}</strong></div></div><div className="practice-journey-action"><button type="button" onClick={() => start(item.exercise)}>{score ? <LuRotateCcw /> : <LuPlay />}{score ? "Ulangi Latihan" : draft ? "Lanjutkan" : "Mulai Latihan"}</button></div></article>; })}</section>}
      {history.length > 0 && (
        <section className="practice-history" aria-label="Riwayat Latihan">
          <h2>Riwayat Latihan</h2>
          <div>
            {history.map((item) => (
              <article key={item.id}>
                <span>{item.level} {item.category ? `| ${item.category} ` : ""}| Latihan {String(item.exercise).padStart(2, "0")}</span>
                <b>{item.score}%</b>
                <small>{item.correct}/{item.total} Benar</small>
              </article>
            ))}
          </div>
        </section>
      )}
    </>}
    {step === "runner" && current && (
      <section className="practice-runner placement-assessment">
        <header className="assessment-topbar placement-topbar-custom">
          <div className="placement-topbar-left">
            <strong>LATIHAN HARIAN</strong>
            <span className="placement-target-badge">{level}</span>
            <span className="placement-name-badge">{activeCategory ?? `Latihan ${exercise}`}</span>
          </div>
          <div className="placement-timer-widget" role="timer" aria-label={`Waktu tersisa: ${time}`}>
            <LuClock className="timer-icon" aria-hidden="true" />
            <span className="timer-title">Sisa Waktu</span>
            <strong className="timer-clock">{time}</strong>
          </div>
        </header>
        <div className="assessment-layout">
          <section className="question-card placement-card-custom">
            <div className="question-header-row">
              <span className="question-area-badge">{activeCategory ?? "Latihan Umum"}</span>
              <span className="question-number-pill">Soal {questionIndex + 1}/{questions.length}</span>
            </div>
            <h1 className="placement-question-prompt">{current.prompt}</h1>
            {activeCategory === "Audio" && (
              <div className="placement-audio-hint" role="note">
                <span className="audio-icon" aria-hidden="true"><LuVolume2 /></span>
                <div>
                  <strong>Soal Menyimak (Choukai)</strong>
                  <small>Dengarkan audio dan baca pertanyaan dengan teliti sebelum memilih jawaban.</small>
                </div>
              </div>
            )}
            <fieldset className="placement-answers-group">
              <legend className="sr-only">Pilih satu jawaban</legend>
              {current.options.map((option, index) => {
                const isSelected = answers[current.id] === index;
                const optionKey = String.fromCharCode(65 + index);
                return (
                  <label className={`placement-option ${isSelected ? "selected" : ""}`} key={option.id}>
                    <input type="radio" name={current.id} checked={isSelected} onChange={() => saveAnswer(index)} />
                    <span className="option-badge">{optionKey}</span>
                    <span className="option-text">{option.text}</span>
                    {isSelected && <span className="option-selected-check" aria-hidden="true"><LuCheck /></span>}
                  </label>
                );
              })}
            </fieldset>
            <div className="runner-actions placement-actions-custom">
              {questionIndex > 0 && <button type="button" className="button button-dark runner-prev-btn" onClick={() => move(questionIndex - 1)}>
                <LuArrowLeft aria-hidden="true" /> Sebelumnya
              </button>}
              {questionIndex < questions.length - 1 ? (
                <button type="button" className="button button-primary runner-next-btn" disabled={answers[current.id] === undefined} onClick={() => move(questionIndex + 1)}>
                  Lanjut Soal <span className="sr-only">Berikutnya</span><LuArrowRight aria-hidden="true" />
                </button>
              ) : (
                <button type="button" className="button button-primary runner-next-btn" disabled={Object.keys(answers).length !== questions.length} onClick={() => submit(Date.now())}>
                  Kumpulkan <span className="sr-only">Submit Selesai</span><LuCheck aria-hidden="true" />
                </button>
              )}
            </div>
          </section>
        </div>
      </section>
    )}
    {step === "result" && result && <section className="practice-result-screen"><p className="dash-kicker">LATIHAN SELESAI</p><h2>Skor</h2><strong>{result.score}%</strong><p>{result.correct} dari {result.total} jawaban benar</p><div><button type="button" onClick={() => setStep("review")}>Lihat Jawaban</button><button type="button" onClick={() => start(exercise)}>Ulangi Latihan</button><button type="button" onClick={() => setStep("list")}>Kembali ke Daftar Latihan</button></div></section>}
    {step === "review" && <section className="practice-review"><button className="practice-back" type="button" onClick={() => setStep("result")}><LuArrowLeft /> Kembali ke Hasil</button><h2>Lihat Jawaban</h2>{questions.map((question, index) => { const userAnswer = answers[question.id]; const correct = userAnswer === answerKey[question.id]; return <article className={correct ? "correct" : "incorrect"} key={question.id}><span>Soal {index + 1} · {correct ? "Benar" : "Salah"}</span><h3>{question.prompt}</h3><p>Jawaban kamu: {question.options[userAnswer]?.text}</p><strong>Jawaban benar: {question.options[answerKey[question.id]]?.text}</strong></article>; })}</section>}
  </main></div>;
}
