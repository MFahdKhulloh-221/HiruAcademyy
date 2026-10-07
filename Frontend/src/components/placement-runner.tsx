"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LuArrowLeft, LuArrowRight, LuCheck, LuClock, LuVolume2 } from "react-icons/lu";
import { useAssessmentAttempt } from "@/components/assessment-hooks";
import { contentMedia, offerPrice, useContent, type PublicOffer } from "@/lib/public-content-api";
import type { ServerAttempt } from "@/lib/assessment-attempt";

type PlacementAttempt = ServerAttempt & { questions: (ServerAttempt["questions"][number] & { category: string; image_url_resolved_url?: string; audio_url_resolved_url?: string })[]; result: (NonNullable<ServerAttempt["result"]> & { areas?: { name: string; score: number; total: number }[] }) | null };
const plans = [
  { id: "sensei", badge: "POPULER", title: "Kelas bersama Sensei", description: "Cocok untuk kamu yang membutuhkan jadwal rutin, bimbingan dan evaluasi langsung.", points: ["Semua fasilitas Belajar Mandiri", "10x live Zoom ・ 90 menit/bulan", "Rekaman kelas dan evaluasi hasil belajar"], action: "Pilih Kelas bersama Sensei →" },
  { id: "lms", badge: "BELAJAR FLEKSIBEL", title: "Belajar Mandiri", description: "Cocok untuk kamu yang ingin belajar menyesuaikan waktu dan kecepatan sendiri.", points: ["Alur belajar dan latihan lengkap", "Try Out dan pembahasan jawaban", "Akses komunitas serta sertifikat digital"], action: "Pilih Belajar Mandiri →" },
  { id: "free", badge: "GRATIS", title: "Coba Gratis", description: "Cocok untuk kamu yang ingin mencoba sistem belajar Hiru sebelum berlangganan.", points: ["Akses 1 chapter lengkap setiap level", "Progres belajar tersimpan", "Akses membaca komunitas"], action: "Mulai Coba Gratis →" },
];

function PlacementReport({ attempt }: { attempt: PlacementAttempt }) {
  const offers = useContent<PublicOffer>("/api/public/offers");
  const result = attempt.result!;
  const level = result.recommendation_level;
  return <main className="public-main placement-result-page"><section className="placement-result-hero"><p className="placement-result-kicker">HASIL PLACEMENT TEST</p><h1>Hasil Evaluasi Level {level ?? "—"}</h1><p>Berikut evaluasi kemampuan bahasa Jepang dan pilihan program belajar yang sesuai dengan hasil tesmu.</p></section><section className="public-section placement-analysis"><div className="public-section-head"><h2>Analisis kemampuan</h2></div><div className="placement-score-grid">{result.areas?.map(area => <article key={area.name}><span>{area.name}</span><strong>{area.score} / 100</strong><i><b style={{ width: `${area.score}%` }} /></i></article>)}</div></section><section className="public-section placement-recommendations"><div className="public-section-head"><h2>Pilihan Belajar untuk Level {level ?? "—"}</h2><p>Pilih cara belajar berdasarkan kebutuhan bimbingan, waktu, dan ritme belajarmu.</p></div>{offers.loading && <p role="status">Memuat program…</p>}{offers.error && <div role="alert">{offers.error} <button type="button" onClick={offers.reload}>Coba lagi</button></div>}<div className="placement-recommendation-grid">{plans.map((plan, index) => {
    const offer = offers.data.find(item => item.program.code.toUpperCase() === level && item.plan_code === plan.id);
    return <article key={plan.id}><div className={`placement-tier-icon offer-icon-${index + 1}`}><svg aria-hidden="true" viewBox="0 0 24 24">{plan.id === "sensei" ? <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></> : plan.id === "lms" ? <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></> : <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>}</svg></div><span>{plan.badge}</span><h3>{plan.id === "free" ? plan.title : `${level ?? "—"} ${plan.title}`}</h3><p>{plan.description}</p><ul className="offer-points">{plan.points.map(point => <li key={point}>{point}</li>)}</ul><strong className="program-price">{plan.id === "free" ? plan.badge : offerPrice(offer)}</strong><Link href={`/register?${level ? `placement=${encodeURIComponent(level)}&` : ""}plan=${plan.id}`}>{plan.action}</Link></article>;
  })}</div></section></main>;
}

export function PlacementRunner({ report = false }: { report?: boolean }) {
  const flow = useAssessmentAttempt("/api/placement/attempts", "placement");
  const attempt = flow.attempt as PlacementAttempt | undefined;
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(0);
  const remaining = attempt?.expires_at && now ? Math.max(0, Math.ceil((Date.parse(attempt.expires_at) - now) / 1000)) : null;
  useEffect(() => {
    if (!attempt || attempt.status === "completed") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [attempt]);
  useEffect(() => {
    if (remaining === 0 && !flow.busy && !flow.error) void flow.submit();
  }, [remaining, flow]);
  useEffect(() => {
    if (attempt?.status === "completed" && !report) router.replace(`/placement/result?attempt=${attempt.id}`);
  }, [attempt, report, router]);
  if (!attempt) return <main className="placement-assessment"><p role={flow.error ? "alert" : "status"}>{flow.error || "Memuat soal placement..."}</p><Link href="/placement" className="button button-secondary">Placement Test</Link></main>;
  if (attempt.status === "completed" && attempt.result) return <PlacementReport attempt={attempt} />;
  const question = attempt.questions[index];
  if (!question) return null;
  const formatted = remaining === null ? "—" : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const image = contentMedia(question.image_url, question.image_url_resolved_url);
  const audio = contentMedia(question.audio_url, question.audio_url_resolved_url);
  return <main className="placement-assessment"><header className="assessment-topbar placement-topbar-custom"><div className="placement-topbar-left"><strong>PLACEMENT TEST</strong></div><div className={`placement-timer-widget ${remaining !== null && remaining < 60 ? "urgent" : ""}`} role="timer" aria-label={`Waktu tersisa: ${formatted}`}><LuClock className="timer-icon" aria-hidden="true" /><span className="timer-title">Sisa Waktu</span><strong className="timer-clock">{formatted}</strong></div><div className="placement-topbar-right" aria-hidden="true" /></header><div className="assessment-layout"><section className="question-card placement-card-custom">{flow.error && <p role="alert">{flow.error}</p>}<div className="question-header-row"><span className="question-area-badge">{question.category}</span><span className="question-number-pill">Soal {index + 1}/{attempt.questions.length}</span></div><h1 className="placement-question-prompt">{question.prompt}</h1>{image && <Image unoptimized src={image} alt="Gambar soal" width={640} height={360} style={{ maxWidth: "100%", height: "auto" }} />}{question.category === "Choukai" && <div className="placement-audio-hint" role="note"><span className="audio-icon" aria-hidden="true"><LuVolume2 /></span><div><strong>Soal Menyimak (Choukai)</strong><small>Dengarkan audio dan baca pertanyaan dengan teliti sebelum memilih jawaban.</small></div></div>}{audio && <audio controls preload="metadata" src={audio} aria-label="Audio" style={{ maxWidth: "100%" }} />}<fieldset className="placement-answers-group" disabled={flow.busy || Boolean(flow.error) || remaining === 0}><legend className="sr-only">Pilih satu jawaban</legend>{Object.entries(question.options).map(([option, text]) => <label className={`placement-option ${flow.answers[question.id] === option ? "selected" : ""}`} key={option}><input checked={flow.answers[question.id] === option} name={`question-${question.id}`} onChange={() => flow.answer(question.id, option)} type="radio" /><span className="option-badge">{option}</span><span className="option-text">{text}</span>{flow.answers[question.id] === option && <span className="option-selected-check" aria-hidden="true"><LuCheck /></span>}</label>)}</fieldset><div className="runner-actions placement-actions-custom"><button type="button" className="button button-dark runner-prev-btn" disabled={!index || flow.busy} hidden={!index} onClick={() => setIndex(value => value - 1)}><LuArrowLeft aria-hidden="true" /> Sebelumnya</button><button type="button" className="button button-primary runner-next-btn" disabled={flow.busy || Boolean(flow.error) || !flow.answers[question.id]} onClick={() => index === attempt.questions.length - 1 ? void flow.submit() : setIndex(value => value + 1)}>{index === attempt.questions.length - 1 ? "Selesaikan Test" : "Lanjut Soal"} <LuArrowRight aria-hidden="true" /></button></div></section></div></main>;
}
