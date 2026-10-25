"use client";

import { PlacementRichText } from "@/components/placement-rich-text";

import { useEffect, useRef, useState } from "react";
import { adminMediaUrl } from "@/lib/admin-media";
import { LuArrowLeft, LuArrowRight, LuCheck, LuClock } from "react-icons/lu";

export type PlacementLevel = "N5" | "N4" | "N3" | "N2" | "N1";
export type PlacementQuestionCount = number;
export type PlacementSettings = { title: string; introHeading: string; minutes: string; description: string; questionCount: PlacementQuestionCount; scoringVersion: "percentage-v1" };
export type PlacementQuestion = { id: string; prompt: string; answers: string[]; correct: string; category: string; level: PlacementLevel | null; passage: string | null; published: boolean; explanation: string; image?: File; audio?: File; imageUrl?: string; audioUrl?: string };

export function PlacementMedia({ image, audio, imageUrl, audioUrl }: { image?: File; audio?: File; imageUrl?: string; audioUrl?: string }) {
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
    {!image && imageUrl && <figure><picture><img src={adminMediaUrl(imageUrl)} alt="Ilustrasi soal" /></picture></figure>}
    {!audio && audioUrl && <audio src={adminMediaUrl(audioUrl)} controls preload="metadata" aria-label="Audio soal" />}
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
    <p className="placement-notice" role="note">Pratinjau bank soal tanpa skor. Konfigurasi: {settings.questionCount} soal · {settings.scoringVersion}. Bank ditampilkan: {questions.length} soal. Urutan adaptif dan hasil hanya ditentukan backend saat tes berlangsung.</p>
    {!started ? <section className="placement-hero-card">
      <div className="placement-hero-copy"><p className="kicker">PLACEMENT TEST</p><h2>{settings.introHeading}</h2><p>{settings.description}</p>
        <div className="public-pills"><span>Gratis</span><span>{settings.questionCount} soal | ±{settings.minutes} menit</span><span>Tanpa skor</span></div>
        <div className="result-actions"><button type="button" className="button button-primary placement-start-cta" disabled={!questions.length} onClick={() => setStarted(true)}>Mulai Tes</button></div>
      </div>
      <aside className="placement-outcomes"><p className="kicker">PRATINJAU ADMIN</p>
        <article><strong>01</strong><div><h3>Bank soal</h3><p>Periksa tampilan Bunpou, Moji・Goi, Dokkai, dan Choukai.</p></div></article>
        <article><strong>02</strong><div><h3>Metadata level</h3><p>Level, kategori, status, bacaan, dan audio ditampilkan per soal.</p></div></article>
        <article><strong>03</strong><div><h3>Tanpa penilaian</h3><p>Pratinjau ini tidak menjalankan pemilihan adaptif, menghitung skor, atau memberi rekomendasi level.</p></div></article>
      </aside>
    </section> : <div className="placement-assessment">
      <header className="assessment-topbar placement-topbar-custom"><div className="placement-topbar-left"><strong>{settings.title}</strong></div>
        <div className="placement-timer-widget" role="timer" aria-label={`Waktu tersisa: ${timer}`}><LuClock className="timer-icon" aria-hidden="true" /><span className="timer-title">Sisa Waktu</span><strong className="timer-clock">{timer}</strong></div><div className="placement-topbar-right" aria-hidden="true" />
      </header>
      <div className="assessment-layout">{question ? <section className="question-card placement-card-custom">
        <div className="question-header-row"><span className="question-area-badge">{question.level ?? "Level belum diisi"} · {question.category} · {question.published ? "Published" : "Draft"}</span><span className="question-number-pill">Soal {index + 1}/{questions.length}</span></div>
        {question.passage && <div className="placement-question-passage"><h3>Bacaan</h3><p style={{ whiteSpace: "pre-wrap" }}><PlacementRichText value={question.passage} /></p></div>}
        <h2 className="placement-question-prompt"><PlacementRichText value={question.prompt} /></h2>
        {question.category === "Choukai" && <div className="placement-audio-hint" role="note"><div><strong>Soal Menyimak (Choukai)</strong><small>Dengarkan audio dan baca pertanyaan dengan teliti sebelum memilih jawaban.</small></div></div>}
        <PlacementMedia image={question.image} audio={question.audio} imageUrl={question.imageUrl} audioUrl={question.audioUrl} />
        <fieldset className="placement-answers-group"><legend className="sr-only">Pilih satu jawaban</legend>{question.answers.map((answer, optionIndex) => <label className={`placement-option ${answers[question.id] === optionIndex ? "selected" : ""}`} key={optionIndex}>
          <input type="radio" name={`preview-${question.id}`} checked={answers[question.id] === optionIndex} onChange={() => setAnswers({ ...answers, [question.id]: optionIndex })} /><span className="option-badge">{String.fromCharCode(65 + optionIndex)}</span><span className="option-text"><PlacementRichText value={answer} /></span>{answers[question.id] === optionIndex && <span className="option-selected-check" aria-hidden="true"><LuCheck /></span>}
        </label>)}</fieldset>
        <div className="runner-actions placement-actions-custom"><button type="button" className="button button-dark runner-prev-btn" disabled={index === 0} onClick={() => setQuestionId(questions[index - 1].id)}><LuArrowLeft aria-hidden="true" /> Sebelumnya</button>
          <button type="button" className="button button-primary runner-next-btn" disabled={answers[question.id] === undefined} onClick={() => { if (index + 1 < questions.length) setQuestionId(questions[index + 1].id); else { setStarted(false); setQuestionId(""); setAnswers({}); } }}>{index === questions.length - 1 ? "Selesaikan Test" : "Lanjut Soal"}<LuArrowRight aria-hidden="true" /></button></div>
      </section> : <p className="placement-empty-text">Belum ada pertanyaan dibuat.</p>}</div>
    </div>}
  </div>;
}
