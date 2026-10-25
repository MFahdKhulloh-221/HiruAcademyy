"use client";

import { PlacementRichText } from "@/components/placement-rich-text";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LuArrowLeft, LuArrowRight, LuCheck, LuClock, LuVolume2 } from "react-icons/lu";
import { useAssessmentAttempt } from "@/components/assessment-hooks";
import { contentMedia, offerPrice, useContent, type PublicOffer } from "@/lib/public-content-api";
import { tryOutRemaining, type ServerAttempt } from "@/lib/assessment-attempt";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import styles from "./placement-report.module.css";

type PlacementAttempt = ServerAttempt & { questions: (ServerAttempt["questions"][number] & { category: string; level?: string; reading_passage?: string; image_url_resolved_url?: string; audio_url_resolved_url?: string })[]; result: (NonNullable<ServerAttempt["result"]> & { result_title?: string; result_description?: string; estimation_label?: string; recommended_program?: { code: string; title: string; path: string } | null; program_message?: string; areas?: { name: string; score: number; correct?: number; total: number }[] }) | null };
const plans = [
  { id: "sensei", badge: "POPULER", title: "Kelas bersama Sensei", description: "Cocok untuk kamu yang membutuhkan jadwal rutin, bimbingan dan evaluasi langsung.", points: ["Semua fasilitas Belajar Mandiri", "10x live Zoom ・ 90 menit/bulan", "Rekaman kelas dan evaluasi hasil belajar"], action: "Pilih Kelas bersama Sensei →" },
  { id: "lms", badge: "BELAJAR FLEKSIBEL", title: "Belajar Mandiri", description: "Cocok untuk kamu yang ingin belajar menyesuaikan waktu dan kecepatan sendiri.", points: ["Alur belajar dan latihan lengkap", "Try Out dan pembahasan jawaban", "Akses komunitas serta sertifikat digital"], action: "Pilih Belajar Mandiri →" },
  { id: "free", badge: "GRATIS", title: "Coba Gratis", description: "Cocok untuk kamu yang ingin mencoba sistem belajar Hiru sebelum berlangganan.", points: ["Akses 1 chapter lengkap setiap level", "Progres belajar tersimpan", "Akses membaca komunitas"], action: "Mulai Coba Gratis →" },
];

function PlacementReport({ attempt }: { attempt: PlacementAttempt }) {
  const offers = useContent<PublicOffer>("/api/public/offers");
  const result = attempt.result!;
  const level = result.recommendation_level;
  const displayedPercentage = result.percentage === undefined ? undefined : Math.round(result.percentage);
  const hasPaidOffer = Boolean(result.recommended_program && offers.data.some(offer => offer.program.code.toUpperCase() === level && (offer.plan_code === "lms" || offer.plan_code === "sensei")));
  return <main className={`public-main placement-result-page ${styles.report}`}>
    <section className={`placement-result-hero ${styles.hero}`}>
      <p className="placement-result-kicker">HASIL PLACEMENT TEST</p>
      <h1>Rekomendasi Level yang disarankan adalah {level ?? "—"}</h1>
      <div className={styles.scoreRing} role="progressbar" aria-label="Skor keseluruhan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={result.percentage} style={{ background: `conic-gradient(var(--orange) ${result.percentage ?? 0}%, #e9edf3 0)` }}><strong>{displayedPercentage ?? "—"}%</strong></div>
      <dl className={styles.stats}><div><dt>Benar</dt><dd>{result.correct}</dd></div><div><dt>Salah</dt><dd>{result.wrong}</dd></div><div><dt>Total soal</dt><dd>{result.total ?? attempt.questions.length}</dd></div>{result.unanswered > 0 && <div><dt>Belum dijawab</dt><dd>{result.unanswered}</dd></div>}</dl>
      {result.recommended_program ? <a className="button button-primary" href="#langkah-belajar">Lihat Program {level ?? result.recommended_program.code}</a> : result.program_message && <p role="status">{result.program_message}</p>}
    </section>
    <section className="public-section placement-analysis">
      <div className="public-section-head"><h2>Ringkasan Hasil per Kategori</h2></div>
      <div className={styles.categories}>{["Bunpou", "Moji・Goi", "Dokkai", "Choukai"].map(name => {
        const area = result.areas?.find(item => item.name === name);
        return <article key={name}><h3>{name}</h3>{area && area.total > 0 ? <><strong>{area.score}%</strong><progress className={styles.progress} max={100} value={area.score} aria-label={`Skor ${name}`} /><p>{area.correct ?? "—"} dari {area.total} soal {name} benar</p></> : <p>Belum diuji</p>}</article>;
      })}</div>
      <p className={styles.note}>Hasil kategori hanya mencerminkan soal yang dikerjakan.</p>
    </section>
    <section id="langkah-belajar" className="public-section placement-recommendations"><div className="public-section-head"><h2>Langkah Belajar Berikutnya</h2><p>{!offers.loading && !offers.error && !hasPaidOffer ? `Pilihan belajar untuk estimasi level ${level ?? "—"} kamu.` : `Program yang sesuai dengan estimasi level ${level ?? "—"} kamu.`}</p></div>{!offers.loading && !offers.error && !hasPaidOffer && <div className={styles.availability} role="status"><h3>Paket belajar {level ?? "—"} belum tersedia</h3><p>Estimasi level kamu tetap {level ?? "—"}. Paket Belajar Mandiri dan Kelas bersama Sensei untuk level ini belum dapat dipilih.</p><p>Coba Gratis tersedia untuk mengenal platform, bukan pengganti program {level ?? "—"}.</p><Link href={result.recommended_program?.path ?? "/program"}>Lihat katalog program</Link></div>}{offers.loading && <LoadingSkeleton variant="cards" label="Memuat program?" />}{offers.error && <div role="alert">{offers.error} <button type="button" onClick={offers.reload}>Coba lagi</button></div>}{!offers.loading && <div className="placement-recommendation-grid">{plans.map((plan, index) => {
    const offer = offers.data.find(item => item.program.code.toUpperCase() === level && item.plan_code === plan.id);
    if ((attempt.adaptive || attempt.scoring_version === "percentage-v1") && plan.id !== "free" && (!result.recommended_program || !offer)) return null;
    return <article key={plan.id}><div className={`placement-tier-icon offer-icon-${index + 1}`}><svg aria-hidden="true" viewBox="0 0 24 24">{plan.id === "sensei" ? <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></> : plan.id === "lms" ? <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></> : <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>}</svg></div><span>{plan.badge}</span><h3>{plan.id === "free" ? plan.title : `${level ?? "—"} ${plan.title}`}</h3><p>{plan.description}</p><ul className="offer-points">{plan.points.map(point => <li key={point}>{point}</li>)}</ul><strong className="program-price">{plan.id === "free" ? plan.badge : offerPrice(offer)}</strong><Link href={(attempt.adaptive || attempt.scoring_version === "percentage-v1") && plan.id !== "free" && result.recommended_program ? `${result.recommended_program.path}${result.recommended_program.path.includes("?") ? "&" : "?"}plan=${plan.id}` : `/register?${level ? `placement=${encodeURIComponent(level)}&` : ""}plan=${plan.id}`}>{plan.action}</Link></article>;
  })}</div>}</section></main>;
}

export function PlacementRunner({ report = false, path = "/api/placement/attempts", preview = false }: { report?: boolean; path?: string; preview?: boolean }) {
  const flow = useAssessmentAttempt(path, "placement");
  const attempt = flow.attempt as PlacementAttempt | undefined;
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const issuedCount = attempt?.questions.length;
  useEffect(() => { if (attempt?.adaptive) heading.current?.focus(); }, [attempt?.adaptive, issuedCount]);
  const remaining = attempt?.server_now ? tryOutRemaining(attempt, now) : attempt?.expires_at && now ? Math.max(0, Math.ceil((Date.parse(attempt.expires_at) - now) / 1000)) : null;
  useEffect(() => {
    if (!attempt || attempt.status === "completed") return;
    const timer = window.setInterval(() => setNow(attempt.server_now ? performance.now() : Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [attempt]);
  useEffect(() => {
    if (remaining === 0 && !flow.busy && !flow.error) void flow.submit();
  }, [remaining, flow]);
  useEffect(() => {
    if (attempt?.status === "completed" && !report && !preview) router.replace(`/placement/result?attempt=${attempt.id}`);
  }, [attempt, report, preview, router]);
  if (!attempt) return <main className="placement-assessment">{flow.error ? <p role="alert">{flow.error}</p> : <LoadingSkeleton variant={report ? "article" : "assessment"} label="Memuat soal placement..." />}<Link href="/placement" className="button button-secondary">Placement Test</Link></main>;
  if (attempt.status === "completed" && attempt.result) return <PlacementReport attempt={attempt} />;
  const unansweredIndex = attempt.questions.findIndex(item => !attempt.answers[item.id]);
  const activeIndex = attempt.adaptive ? (unansweredIndex < 0 ? attempt.questions.length - 1 : unansweredIndex) : index;
  const question = attempt.questions[activeIndex];
  const limit = attempt.question_limit ?? attempt.questions.length;
  const finalQuestion = activeIndex + 1 >= limit;
  if (!question) return <main className="placement-assessment"><p role="alert">{flow.error || "Soal placement tidak tersedia."}</p><Link href="/placement" className="button button-secondary">Placement Test</Link></main>;
  const formatted = remaining === null ? "—" : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const image = contentMedia(question.image_url, question.image_url_resolved_url);
  const audio = contentMedia(question.audio_url, question.audio_url_resolved_url);
  return <main className="placement-assessment"><header className="assessment-topbar placement-topbar-custom"><div className="placement-topbar-left"><strong>PLACEMENT TEST</strong></div><div className={`placement-timer-widget ${remaining !== null && remaining < 60 ? "urgent" : ""}`} role="timer" aria-label={`Waktu tersisa: ${formatted}`}><LuClock className="timer-icon" aria-hidden="true" /><span className="timer-title">Sisa Waktu</span><strong className="timer-clock">{formatted}</strong></div><div className="placement-topbar-right" aria-hidden="true" /></header><div className="assessment-layout"><section className="question-card placement-card-custom">{flow.error && <div role="alert"><p>{flow.error}</p><button type="button" disabled={flow.busy} onClick={() => void flow.retrySave()}>Coba simpan lagi</button><p>Jika sesi berubah di tab lain, muat ulang halaman untuk melanjutkan jawaban yang tersimpan.</p></div>}<div className="question-header-row"><span className="question-area-badge">{question.category}</span><span className="question-number-pill" aria-live="polite">Soal {activeIndex + 1}/{limit}</span></div><h1 ref={heading} tabIndex={0} className="placement-question-prompt"><PlacementRichText value={question.prompt ?? ""} /></h1>{question.reading_passage && <p className="placement-reading-passage" style={{ whiteSpace: "pre-wrap" }}><PlacementRichText value={question.reading_passage} /></p>}{attempt.adaptive && <p>Jawaban tersimpan saat dipilih. Soal berikutnya menyesuaikan jawabanmu; jawaban sebelumnya tidak dapat diubah.</p>}{image && <Image unoptimized src={image} alt="Gambar soal" width={640} height={360} style={{ maxWidth: "100%", height: "auto" }} />}{question.category === "Choukai" && <div className="placement-audio-hint" role="note"><span className="audio-icon" aria-hidden="true"><LuVolume2 /></span><div><strong>Soal Menyimak (Choukai)</strong><small>Dengarkan audio dan baca pertanyaan dengan teliti sebelum memilih jawaban.</small></div></div>}{audio && <audio controls preload="metadata" src={audio} aria-label="Audio" style={{ maxWidth: "100%" }} />}<fieldset className="placement-answers-group" disabled={flow.busy || Boolean(flow.error) || remaining === 0 || Boolean(attempt.adaptive && attempt.answers[question.id])}><legend className="sr-only">Pilih satu jawaban</legend>{Object.entries(question.options).map(([option, text]) => <label className={`placement-option ${flow.answers[question.id] === option ? "selected" : ""}`} key={option}><input checked={flow.answers[question.id] === option} name={`question-${question.id}`} onChange={() => flow.answer(question.id, option)} type="radio" /><span className="option-badge">{option}</span><span className="option-text"><PlacementRichText value={text} /></span>{flow.answers[question.id] === option && <span className="option-selected-check" aria-hidden="true"><LuCheck /></span>}</label>)}</fieldset><div className="runner-actions placement-actions-custom">{!attempt.adaptive && index > 0 && <button type="button" className="button button-dark runner-prev-btn" disabled={flow.busy} onClick={() => setIndex(value => value - 1)}><LuArrowLeft aria-hidden="true" /> Sebelumnya</button>}{(!attempt.adaptive || finalQuestion) && <button type="button" className="button button-primary runner-next-btn" disabled={flow.busy || Boolean(flow.error) || !flow.answers[question.id]} onClick={() => finalQuestion ? void flow.submit() : setIndex(value => value + 1)}>{finalQuestion ? "Selesaikan Test" : "Lanjut Soal"} <LuArrowRight aria-hidden="true" /></button>}</div></section></div></main>;
}
