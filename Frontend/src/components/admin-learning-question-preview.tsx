"use client";

import { useEffect, useId, useRef, useState } from "react";

export type AdminLearningQuestion = {
  id: string;
  context: string;
  chapter: string;
  prompt: string;
  instruction: string;
  answers: string[];
  correctAnswer: number;
  explanation: string;
  order: string;
  status: "Draft" | "Published";
  file: File | null;
};

export function AdminLearningQuestionPreview({ kind, questions, passage, title, initialQuestionId }: { kind: "Audio" | "Reading"; questions: AdminLearningQuestion[]; passage: string; title: string; initialQuestionId?: string }) {
  const [index, setIndex] = useState(() => Math.max(0, questions.findIndex((question) => question.id === initialQuestionId)));
  const [selected, setSelected] = useState<Record<string, number>>({});
  const player = useRef<HTMLAudioElement>(null);
  const radioName = useId();
  const activeIndex = Math.min(index, Math.max(0, questions.length - 1));
  const question = questions[activeIndex];
  const file = question?.file;
  useEffect(() => {
    const element = player.current;
    if (!element || !file) return;
    const url = URL.createObjectURL(file);
    element.src = url;
    return () => { element.pause(); element.removeAttribute("src"); element.load(); URL.revokeObjectURL(url); };
  }, [file]);
  return <section className="admin-learning-question-preview learning-question-page" aria-label={`Pratinjau ${kind}`}>
    <header className="learning-question-head"><h2>{kind === "Audio" ? "Dengarkan percakapan dan pilih jawaban yang tepat" : "Baca teks pendek lalu jawab pertanyaan"}</h2><p>{kind === "Audio" ? "Audio dapat diputar ulang sesuai konfigurasi soal." : "Baca teks pendek dengan teliti lalu jawab pertanyaan."}</p></header>
    <div className="learning-question-layout"><div>
      {kind === "Audio" ? <section className="audio-player" aria-label="Audio pembelajaran"><div><strong>{title}</strong>{file ? <audio ref={player} controls preload="metadata" aria-label={title || question?.prompt} /> : <p>OPEN: file audio lokal belum tersedia.</p>}</div></section> : <section className="reading-passage"><p className="dash-kicker">TEKS BACAAN</p><p lang="ja">{passage}</p></section>}
      {question ? <><section className="learning-question-card"><p className="dash-kicker">SOAL {activeIndex + 1} DARI {questions.length}</p><h2>{question.prompt}</h2>{question.instruction && <p>{question.instruction}</p>}<fieldset><legend className="sr-only">Pilihan jawaban</legend>{question.answers.map((answer, answerIndex) => <label className={selected[question.id] === answerIndex ? "selected" : ""} key={answerIndex}><input type="radio" name={`${radioName}-${question.id}`} checked={selected[question.id] === answerIndex} onChange={() => setSelected((current) => ({ ...current, [question.id]: answerIndex }))} /><span>{String.fromCharCode(65 + answerIndex)}. {answer}</span></label>)}</fieldset></section><div className="learning-question-actions"><button className="button button-secondary" type="button" disabled={activeIndex === 0} onClick={() => setIndex(activeIndex - 1)}>← Sebelumnya</button><button className="button button-dark" type="button" disabled={activeIndex === questions.length - 1} onClick={() => setIndex(activeIndex + 1)}>Berikutnya →</button></div></> : <p>Belum ada data</p>}
    </div><aside className="learning-question-sidebar"><section><strong>{question?.context} • {question?.chapter}</strong><span>{kind}</span><p>Pratinjau visual saja. Tidak ada penilaian atau perubahan progres siswa.</p></section><nav aria-label="Navigasi soal"><span>SOAL</span><div>{questions.map((item, itemIndex) => <button className={itemIndex === activeIndex ? "active" : ""} aria-current={itemIndex === activeIndex ? "step" : undefined} aria-label={`Soal ${itemIndex + 1}`} key={item.id} type="button" onClick={() => setIndex(itemIndex)}>{itemIndex + 1}</button>)}</div></nav></aside></div>
  </section>;
}
