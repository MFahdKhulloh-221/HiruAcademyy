"use client";

import { useEffect, useRef, useState } from "react";
import { LuArrowLeft, LuArrowRight, LuCheck, LuClock } from "react-icons/lu";

export type PlacementSettings = { title: string; introHeading: string; minutes: string; description: string };
export type PlacementQuestion = { id: string; prompt: string; answers: string[]; correct: string; category: string; published: boolean; explanation: string; image?: File; audio?: File; imageUrl?: string; audioUrl?: string };

export function PlacementMedia({ image, audio }: { image?: File; audio?: File }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!image || !imageRef.current) return;
    const element = imageRef.current;
    const url = URL.createObjectURL(image);
    element.src = url;
    return () => { element.removeAttribute("src"); URL.revokeObjectURL(url); };
  }, [image]);
  useEffect(() => {
    if (!audio || !audioRef.current) return;
    const element = audioRef.current;
    const url = URL.createObjectURL(audio);
    element.src = url;
    return () => { element.pause(); element.removeAttribute("src"); element.load(); URL.revokeObjectURL(url); };
  }, [audio]);
  return <div className="placement-runner-media admin-placement-media">
    {image && <figure><picture><img ref={imageRef} alt="Ilustrasi soal" /></picture><figcaption>{image.name}</figcaption></figure>}
    {audio && <figure><audio ref={audioRef} controls preload="metadata" aria-label={audio.name} /><figcaption>{audio.name}</figcaption></figure>}
  </div>;
}

export function AdminPlacementPreview({ settings, questions, initialQuestionId }: { settings: PlacementSettings; questions: PlacementQuestion[]; initialQuestionId?: string }) {
  const [questionId, setQuestionId] = useState(initialQuestionId ?? "");
  const [started, setStarted] = useState(Boolean(initialQuestionId));
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const index = Math.max(0, questions.findIndex((question) => question.id === questionId));
  const question = questions[index];
  const minutes = Number(settings.minutes);
  const timer = Number.isSafeInteger(minutes) && minutes > 0 ? `${String(minutes).padStart(2, "0")}:00` : "—";
  return <div className="admin-placement-preview">
    {!started ? <section className="placement-hero-card">
      <div className="placement-hero-copy"><p className="kicker">PLACEMENT TEST</p><h2>{settings.introHeading}</h2><p>{settings.description}</p>
        <div className="public-pills"><span>Gratis</span><span>{questions.length} soal | ±{settings.minutes} menit</span><span>Hasil langsung</span></div>
        <div className="result-actions"><button type="button" className="button button-primary placement-start-cta" disabled={!questions.length} onClick={() => setStarted(true)}>Mulai Tes</button></div>
      </div>
      <aside className="placement-outcomes"><p className="kicker">HASIL YANG KAMU DAPATKAN</p>
        <article><strong>01</strong><div><h3>Analisis 4 kemampuan</h3><p>Lihat hasil Bunpou, Moji・Goi, Dokkai, dan Choukai.</p></div></article>
        <article><strong>02</strong><div><h3>Rekomendasi level</h3><p>Dapatkan rekomendasi level N5–N1 sesuai hasil tesmu.</p></div></article>
        <article><strong>03</strong><div><h3>Fokus yang perlu diperbaiki</h3><p>Temukan kemampuan yang sudah kuat dan bagian yang perlu kamu prioritaskan.</p></div></article>
      </aside>
    </section> : <div className="placement-assessment">
      <header className="assessment-topbar placement-topbar-custom"><div className="placement-topbar-left"><strong>{settings.title}</strong></div>
        <div className="placement-timer-widget" role="timer" aria-label={`Waktu tersisa: ${timer}`}><LuClock className="timer-icon" aria-hidden="true" /><span className="timer-title">Sisa Waktu</span><strong className="timer-clock">{timer}</strong></div><div className="placement-topbar-right" aria-hidden="true" />
      </header>
      <div className="assessment-layout">{question ? <section className="question-card placement-card-custom">
        <div className="question-header-row"><span className="question-area-badge">{question.category}</span><span className="question-number-pill">Soal {index + 1}/{questions.length}</span></div>
        <h2 className="placement-question-prompt">{question.prompt}</h2>
        {question.category === "Choukai" && <div className="placement-audio-hint" role="note"><div><strong>Soal Menyimak (Choukai)</strong><small>Dengarkan audio dan baca pertanyaan dengan teliti sebelum memilih jawaban.</small></div></div>}
        <PlacementMedia image={question.image} audio={question.audio} />
        <fieldset className="placement-answers-group"><legend className="sr-only">Pilih satu jawaban</legend>{question.answers.map((answer, optionIndex) => <label className={`placement-option ${answers[question.id] === optionIndex ? "selected" : ""}`} key={optionIndex}>
          <input type="radio" name={`preview-${question.id}`} checked={answers[question.id] === optionIndex} onChange={() => setAnswers({ ...answers, [question.id]: optionIndex })} /><span className="option-badge">{String.fromCharCode(65 + optionIndex)}</span><span className="option-text">{answer}</span>{answers[question.id] === optionIndex && <span className="option-selected-check" aria-hidden="true"><LuCheck /></span>}
        </label>)}</fieldset>
        <div className="runner-actions placement-actions-custom"><button type="button" className="button button-dark runner-prev-btn" disabled={index === 0} onClick={() => setQuestionId(questions[index - 1].id)}><LuArrowLeft aria-hidden="true" /> Sebelumnya</button>
          <button type="button" className="button button-primary runner-next-btn" disabled={answers[question.id] === undefined} onClick={() => { if (index + 1 < questions.length) setQuestionId(questions[index + 1].id); else { setStarted(false); setQuestionId(""); setAnswers({}); } }}>{index === questions.length - 1 ? "Selesaikan Test" : "Lanjut Soal"}<LuArrowRight aria-hidden="true" /></button></div>
      </section> : <p className="placement-empty-text">Belum ada pertanyaan dibuat.</p>}</div>
    </div>}
  </div>;
}
