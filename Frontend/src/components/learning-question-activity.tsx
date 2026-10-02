"use client";

import Link from "next/link";
import { useState } from "react";
import type { LearningData } from "@/lib/learning-mock";
import { completeChapterActivity } from "@/lib/learning-progress";

export function LearningQuestionActivity({ data, variant }: { data: LearningData; variant: "audio" | "reading" }) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ correct: number; total: number }>();
  const questions = variant === "audio" ? data.audioQuestions : data.readingQuestions;
  const question = questions[questionIndex];
  const basePath = `/learn/${data.levelSlug}/${data.chapterSlug}`;
  const query = `?membership=${data.membership}`;
  const isAudio = variant === "audio";

  function submit() {
    const correct = questions.filter((item) => answers[item.id] === item.correctAnswer).length;
    setResult({ correct, total: questions.length });
    completeChapterActivity(data.levelSlug, data.chapterSlug, variant);
  }

  if (result) {
    const score = Math.round(result.correct / result.total * 100);
    return <section className="checkpoint-result learning-question-result"><p className="dash-kicker">{isAudio ? "AUDIO" : "READING"} SELESAI</p><h1>Hasil</h1><div className="checkpoint-result-stats"><div><span>Benar</span><strong>{result.correct}</strong></div><div><span>Salah</span><strong>{result.total - result.correct}</strong></div><div><span>Total</span><strong>{result.total}</strong></div></div><div className="checkpoint-recommendation"><p className="dash-kicker">NILAI</p><strong>{score}</strong></div><div className="learning-question-actions"><Link className="button button-primary" href={`${basePath}${query}`}>Kembali ke Aktivitas Chapter</Link></div></section>;
  }

  return <div className="learning-question-page"><header className="learning-question-head"><h1>{isAudio ? "Dengarkan percakapan dan pilih jawaban yang tepat" : "Baca teks pendek lalu jawab pertanyaan"}</h1><p>{isAudio ? "Audio dapat diputar ulang sesuai konfigurasi soal." : "Baca teks pendek dengan teliti lalu jawab pertanyaan."}</p></header><div className="learning-question-layout"><main>{isAudio ? <section className="audio-player" aria-label="Audio pembelajaran"><button type="button" aria-label="Putar audio">▶</button><div><strong>Percakapan tentang rutinitas pagi</strong><span>Tekan putar untuk mendengarkan kembali</span></div></section> : <section className="reading-passage"><p className="dash-kicker">TEKS BACAAN</p><p lang="ja">{data.readingPassage}</p></section>}<section className="learning-question-card"><p className="dash-kicker">SOAL {questionIndex + 1} DARI {questions.length}</p><h2>{question.prompt}</h2>{question.instruction && <p>{question.instruction}</p>}<fieldset><legend className="sr-only">Pilihan jawaban</legend>{question.answers.map((answer, index) => <label className={answers[question.id] === index ? "selected" : ""} key={answer}><input type="radio" name={question.id} checked={answers[question.id] === index} onChange={() => setAnswers((current) => ({ ...current, [question.id]: index }))} /><span>{String.fromCharCode(65 + index)}. {answer}</span></label>)}</fieldset></section><div className="learning-question-actions"><button className="button button-secondary" type="button" disabled={questionIndex === 0} onClick={() => setQuestionIndex((value) => value - 1)}>← Sebelumnya</button>{questionIndex < questions.length - 1 ? <button className="button button-dark" type="button" onClick={() => setQuestionIndex((value) => value + 1)}>Berikutnya →</button> : <button className="button button-dark" type="button" disabled={Object.keys(answers).length !== questions.length} onClick={submit}>Kumpulkan Jawaban</button>}</div></main><aside className="learning-question-sidebar"><section><p className="dash-kicker">{isAudio ? "Audio" : "Reading"} Progress</p><strong>{Object.keys(answers).length} dari {questions.length} soal</strong></section><nav aria-label="Navigasi soal"><span>Navigasi soal</span><div>{questions.map((item, index) => <button type="button" className={index === questionIndex ? "active" : answers[item.id] !== undefined ? "answered" : ""} onClick={() => setQuestionIndex(index)} key={item.id}>{index + 1}</button>)}</div></nav><section className="learning-question-info"><strong>{isAudio ? "Informasi" : "Pengumuman"}</strong><p>Jawaban dapat diubah sebelum assessment diselesaikan.</p></section></aside></div></div>;
}
