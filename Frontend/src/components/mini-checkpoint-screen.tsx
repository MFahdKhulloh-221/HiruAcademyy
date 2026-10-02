"use client";

import Link from "next/link";
import { useState } from "react";
import {
  LuArrowLeft,
  LuCircleAlert,
  LuCircleCheck,
  LuClock,
  LuFileCheck,
  LuFlag,
  LuKey,
  LuRotateCcw,
  LuSparkles,
} from "react-icons/lu";
import { AssessmentUnavailable } from "@/components/assessment-unavailable";
import { miniCheckpoints } from "@/lib/sensei-mock";
import { usePublishedAssessments, type PublishedAssessment } from "@/lib/assessment-store";
import type { Membership } from "@/lib/dashboard-mock";

const defaultItem = miniCheckpoints.find((group) => group.level === "N4")!.items.find((item) => item.session === "sesi 2" && item.part === "part 1")!;
type View = "list" | "info" | "runner" | "result" | "review" | "unavailable" | "review-unavailable";

export function MiniCheckpointScreen({ membership = "sensei" }: { membership?: Membership } = {}) {
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState(defaultItem);
  const [answer, setAnswer] = useState("b");
  const [marked, setMarked] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<"N5" | "N4" | "N3" | "N2">("N5");
  const [question, setQuestion] = useState(4);
  const [reviewFilter, setReviewFilter] = useState("SEMUA 10");
  const [reviewQuestion, setReviewQuestion] = useState(4);
  const [selectedAssessment, setSelectedAssessment] = useState<PublishedAssessment>();
  const published = usePublishedAssessments().filter((item) => item.type === "mini-checkpoint");
  const activeQuestions = selectedAssessment?.questions ?? [];
  const activeQuestion = activeQuestions[Math.min(question - 1, Math.max(activeQuestions.length - 1, 0))];
  const totalQuestions = selectedAssessment ? activeQuestions.length : 10;
  const hierarchyItems = Array.from(new Map([
    ...(miniCheckpoints.find((group) => group.level === selectedLevel)?.items ?? []).map((item) => [`${item.level}|${item.session}|${item.part}`, { item, assessment: undefined as PublishedAssessment | undefined } ] as const),
    ...published.filter((item) => item.level === selectedLevel && item.session && item.part).map((assessment) => [`${assessment.level}|sesi ${assessment.session}|part ${assessment.part}`, { item: { id: assessment.id, level: assessment.level, session: `sesi ${assessment.session}`, part: `part ${assessment.part}` }, assessment }] as const),
  ]).values());

  if (view === "unavailable") {
    return (
      <AssessmentUnavailable
        eyebrow="MINI CHECKPOINT • BELUM TERSEDIA"
        title="Mini Checkpoint belum dapat dikerjakan"
        description="Akses mengikuti cohort, progres pertemuan, dan jadwal rilis resmi kelas."
        facts={["Cohort aktif", "Progres kelas", "Rilis akademik"]}
        primary={{ label: "Kembali ke Daftar", onClick: () => setView("list") }}
        secondary={{ label: "Kembali Dashboard", href: `/dashboard?membership=${membership}` }}
      />
    );
  }

  if (view === "review-unavailable") {
    return (
      <AssessmentUnavailable
        eyebrow="ULASAN • DINONAKTIFKAN"
        title="Ulasan jawaban belum tersedia"
        description="Ulasan pembahasan dinonaktifkan sementara untuk sesi ini. Skor dan hasil tetap tersimpan."
        facts={["Aturan per Mini Checkpoint", "Nilai tersimpan", "Otoritas akademik"]}
        primary={{ label: "Kembali ke Hasil", onClick: () => setView("result") }}
        secondary={{ label: "Kembali ke Daftar", onClick: () => setView("list") }}
      />
    );
  }

  if (view === "runner") {
    return (
      <div className="mini-runner">
        <header>
          <div>
            <p className="dash-kicker">
              MINI CHECKPOINT • {selected.level} {selected.session.toUpperCase()} {selected.part.toUpperCase()}
            </p>
            <h1>Soal {question} dari {totalQuestions}</h1>
            <p>Jawaban tersimpan otomatis sesuai alur evaluasi resmi kelas Sensei.</p>
          </div>
          <span>TIMER AKTIF</span>
        </header>
        <section className="mini-runner-stats">
          <div>
            <strong>4 / 10</strong>
            <span>Soal dijawab</span>
          </div>
          <div>
            <strong>1 soal</strong>
            <span>Ditandai</span>
          </div>
          <div>
            <strong>Aktif</strong>
            <span>Penyimpanan otomatis</span>
          </div>
        </section>
        <div className="mini-runner-layout">
          <main>
            <section className="learning-question-card">
<p className="dash-kicker">BAGIAN {activeQuestion?.section.toUpperCase() ?? "BUNPOU"} • SOAL {question}</p>
               <h2>{activeQuestion?.prompt ?? "Pilih jawaban yang paling tepat."}</h2>
               <p className="mini-question-japanese">{activeQuestion?.japanese?.text ?? "日本へ行く前に、パスポートを＿＿＿＿。"}</p>
              <fieldset>
                <legend className="sr-only">Pilihan jawaban</legend>
{(activeQuestion?.options.map((option) => [option.id, option.label]) ?? [
                   ["a", "確認しておきます"],
                   ["b", "確認しています"],
                   ["c", "確認したことがあります"],
                   ["d", "確認するでしょう"],
                 ]).map(([id, label], index) => (
                  <label className={answer === id ? "selected" : ""} key={id}>
                    <input
                      type="radio"
                      name="mini-answer"
                      checked={answer === id}
                      onChange={() => setAnswer(id)}
                    />
                    <span>
                      {String.fromCharCode(65 + index)}. {label}
                    </span>
                  </label>
                ))}
              </fieldset>
            </section>
            <div className="mini-question-actions">
              <button
                type="button"
                onClick={() => setQuestion((value) => Math.max(1, value - 1))}
                disabled={question === 1}
              >
                Sebelumnya
              </button>
              <button
                className={marked ? "marked" : ""}
                type="button"
                onClick={() => setMarked((value) => !value)}
              >
                <LuFlag aria-hidden="true" style={{ display: "inline-block", marginRight: "4px" }} />
                {marked ? "Tersimpan Ditandai" : "Tandai Soal"}
              </button>
              <button
                type="button"
onClick={() => setQuestion((value) => Math.min(totalQuestions, value + 1))}
                 disabled={question === totalQuestions}
              >
                Selanjutnya
              </button>
            </div>
          </main>
          <aside>
            <p className="dash-kicker">NAVIGATOR</p>
            <strong>4 dijawab • {marked ? "1" : "0"} ditandai</strong>
            <div>
              {Array.from({ length: 10 }, (_, index) => (
                <button
                  className={index + 1 === question ? "active" : ""}
                  onClick={() => setQuestion(index + 1)}
                  type="button"
                  key={index}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <button className="mini-submit" type="button" onClick={() => setView("result")}>
              Kirim Jawaban
            </button>
            <button type="button" onClick={() => setView("list")}>
              Keluar Sesi
            </button>
          </aside>
        </div>
      </div>
    );
  }

  if (view === "result") {
    return (
      <div className="mini-result">
        <header>
          <p className="dash-kicker">
            MINI CHECKPOINT • {selected.level} {selected.session.toUpperCase()} {selected.part.toUpperCase()} • HASIL
          </p>
          <h1>Hasil Mini Checkpoint berhasil diproses</h1>
          <p>Skor, status kelulusan, dan rekomendasi belajar tersimpan resmi di akunmu.</p>
          <span>SELESAI</span>
        </header>
        <section className="mini-score">
          <p className="dash-kicker">SKOR AKHIR</p>
          <strong>8 / 10 (80%)</strong>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <LuSparkles aria-hidden="true" />
            LULUS
          </span>
          <p>LULUS • Passing score minimum 75% • Evaluasi tercatat resmi</p>
          <div>
            <button type="button" onClick={() => setView("review")}>
              Ulasan Jawaban
            </button>
            <button type="button" onClick={() => setView("list")}>
              Kembali ke Daftar
            </button>
          </div>
        </section>
        <section className="mini-breakdown">
          <header>
            <p className="dash-kicker">RINGKASAN NILAI</p>
            <h2>Performa per bagian</h2>
            <p>Standar kelulusan: Lulus jika skor &ge; 75%. Tidak lulus jika skor &lt; 75%.</p>
          </header>
          <div>
            {[
              ["86%", "Moji Goi"],
              ["80%", "Bunpou"],
              ["78%", "Dokkai"],
              ["84%", "Choukai"],
            ].map(([value, label]) => (
              <article key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </article>
            ))}
          </div>
        </section>
        <section className="mini-result-notes">
          <article>
            <span style={{ display: "grid", placeItems: "center" }}>
              <LuCircleCheck aria-hidden="true" />
            </span>
            <div>
              <p className="dash-kicker">Kekuatan • AKTIF</p>
              <strong>Kosakata dan listening menunjukkan hasil stabil di atas passing score.</strong>
              <small>Pertahankan konsistensi review flashcard harian.</small>
            </div>
          </article>
          <article>
            <span style={{ display: "grid", placeItems: "center" }}>
              <LuCircleAlert aria-hidden="true" />
            </span>
            <div>
              <p className="dash-kicker">Perlu Diperkuat • REKOMENDASI</p>
              <strong>Dokkai dan pola kalimat masih mendekati ambang batas kelulusan.</strong>
              <small>Direkomendasikan mengulang Reading Drill dan modul Chapter 4.</small>
            </div>
          </article>
        </section>
        <section className="mini-consent">
          <strong>PROGRES KELAS &amp; REVIEW</strong>
          <p>{selected.level} {selected.session} {selected.part} • Ulasan jawaban aktif • Hasil tersimpan resmi</p>
          <p>Admin mengatur durasi sesi, passing score, jumlah soal, dan rilis materi Mini Checkpoint.</p>
        </section>
      </div>
    );
  }

  if (view === "review") {
    return (
      <div className="mini-review">
        <header>
          <div>
            <p className="dash-kicker">
              MINI CHECKPOINT • {selected.level} {selected.session.toUpperCase()} {selected.part.toUpperCase()} • ULASAN
            </p>
            <h1>Tinjau jawaban dan pembahasan</h1>
            <p>Review jawaban terstandarisasi untuk memperkuat materi bimbingan kelas.</p>
          </div>
          <span>REVIEW AKTIF</span>
        </header>
        <div className="mini-review-filters">
          <span>FILTER JAWABAN</span>
          {["SEMUA 10", "SALAH 2", "BENAR 8", "DITANDAI 1", "BUNPOU"].map((item) => (
            <button
              className={reviewFilter === item ? "active" : ""}
              type="button"
              onClick={() => setReviewFilter(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mini-review-layout">
          <aside>
            <h2>DAFTAR SOAL</h2>
            {Array.from({ length: 10 }, (_, index) => (
              <button
                className={reviewQuestion === index + 1 ? "active" : ""}
                type="button"
                onClick={() => setReviewQuestion(index + 1)}
                key={index}
              >
                Soal {index + 1} <span>• {index === 3 ? "Salah" : "Benar"}</span>
              </button>
            ))}
          </aside>
          <main>
            <p className="dash-kicker">SOAL {reviewQuestion} • BUNPOU</p>
            {reviewQuestion === 4 ? (
              <>
                <h2>日本へ行く前に、パスポートを＿＿＿＿。</h2>
                <div className="mini-review-answers">
                  <div>
                    <span>Jawabanmu</span>
                    <strong>B. 確認しています</strong>
                  </div>
                  <div>
                    <span>Jawaban benar</span>
                    <strong>A. 確認しておきます</strong>
                  </div>
                </div>
                <section>
                  <p className="dash-kicker">PEMBAHASAN</p>
                  <p>
                    Pola ～ておく digunakan untuk menyatakan persiapan yang dilakukan sebelumnya. Karena konteksnya
                    “sebelum pergi ke Jepang”, jawaban A paling tepat.
                  </p>
                  <p>Rekomendasi: buka Modul Tata Bahasa Chapter 4 dan ulangi Reading Drill.</p>
                </section>
              </>
            ) : (
              <section className="tryout-review-placeholder">
                <p>Ulasan pembahasan tersedia untuk soal yang dipilih.</p>
              </section>
            )}
          </main>
        </div>
        <div className="learning-question-actions">
          <button className="button button-secondary" type="button" onClick={() => setView("result")}>
            Kembali ke Hasil
          </button>
          <Link className="button button-dark" href={`/practice?membership=${membership}`}>
            Latihan Rekomendasi
          </Link>
        </div>
      </div>
    );
  }

  if (view === "info") {
    return (
      <>
        <button className="sensei-back" onClick={() => setView("list")}>
          <LuArrowLeft aria-hidden="true" /> Kembali ke Daftar
        </button>
        <div className="mini-info-head">
          <header className="sensei-page-head">
            <p className="dash-kicker">
              MINI CHECKPOINT • {selected.level} {selected.session.toUpperCase()} {selected.part.toUpperCase()}
            </p>
            <h1>{selected.level} {selected.session} {selected.part} siap dikerjakan</h1>
            <p>Durasi sesi dimulai saat evaluasi dimulai.</p>
          </header>
          <span>TERSEDIA</span>
        </div>
        <section className="mini-intro">
          <p className="dash-kicker">MINI CHECKPOINT KELAS</p>
          <h2>10 soal singkat • passing score minimum 75%</h2>
          <p>Jawaban tersimpan otomatis. Saat waktu habis, sistem melakukan auto-submit dan menghitung skor.</p>
          <button type="button" onClick={() => setView("runner")} style={{ opacity: 1 }}>
            Mulai Mini Checkpoint
          </button>
        </section>
        <section className="mini-rules">
          <header>
            <p className="dash-kicker">ATURAN SESI</p>
            <h2>Yang perlu diperhatikan</h2>
            <p>Aturan akses mengikuti cohort aktif dan progres pertemuan bimbingan Sensei.</p>
          </header>
          <div>
            {[
              { icon: <LuKey aria-hidden="true" />, title: "Akses", detail: "Belajar dengan Sensei • Cohort aktif", note: "Paket belajar dan jadwal pertemuan diverifikasi sistem" },
              { icon: <LuClock aria-hidden="true" />, title: "Durasi", detail: "Durasi terstandarisasi per evaluasi", note: "Dikerjakan fokus dalam satu sesi evaluasi" },
              { icon: <LuRotateCcw aria-hidden="true" />, title: "Struktur", detail: "Khusus N5, N4, N3, dan N2 • Sesi & Part", note: "Evaluasi bertahap setiap sesi dan part" },
              { icon: <LuFileCheck aria-hidden="true" />, title: "Ulasan Jawaban", detail: "Skor dan status kelulusan tampil setelah submit", note: "Review pembahasan lengkap tersedia setelah pengerjaan" },
            ].map((rule) => (
              <article key={rule.title}>
                <span>{rule.icon}</span>
                <div>
                  <p className="dash-kicker">{rule.title} • AKTIF</p>
                  <strong>{rule.detail}</strong>
                  <small>{rule.note}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="mini-consent">
          <p>Dengan memulai, pengguna menyetujui autosave, pencatatan hasil, dan aturan akses berdasarkan progres pertemuan.</p>
          <p>Koneksi terputus tidak menghapus jawaban yang tersimpan. Timer tetap tersimpan resmi sampai submit atau waktu selesai.</p>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="mini-list-head">
        <header className="sensei-page-head">
          <p className="dash-kicker">MINI CHECKPOINT • KELAS SENSEI</p>
          <h1>Mini Checkpoint per level, sesi, dan part</h1>
          <p>Khusus member Belajar dengan Sensei. Evaluasi pemahaman berjenjang per sesi dan part.</p>
        </header>
        <span className="mini-cohort-badge">COHORT SENSEI</span>
      </div>

      <div className="mini-dropdown-container">
        <label htmlFor="mini-level-select">Pilih Level:</label>
        <select
          id="mini-level-select"
          className="mini-level-dropdown"
          value={selectedLevel}
          onChange={(event) => setSelectedLevel(event.target.value as "N5" | "N4" | "N3" | "N2")}
        >
          <option value="N5">Level N5</option>
          <option value="N4">Level N4</option>
          <option value="N3">Level N3</option>
          <option value="N2">Level N2</option>
        </select>
      </div>

      <section className="mini-vertical-cards-section" aria-label={`Daftar Mini Checkpoint ${selectedLevel}`}>
        {hierarchyItems.map(({ item: currentItem, assessment }) => {
           const title = assessment?.title ?? `${selectedLevel} ${currentItem.session} ${currentItem.part}`;

          return (
            <article className="mini-checkpoint-card" key={title}>
              <div className="mini-checkpoint-card-left">
                <span className="mini-card-icon" aria-hidden="true"><LuFileCheck /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{assessment?.questions.length ?? 10} soal singkat • timer ±{assessment?.durationMinutes ?? 10} menit</p>
                </div>
              </div>
              <div className="mini-checkpoint-card-right">
                <span className="mini-card-status-badge">Tersedia</span>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                     setSelected(currentItem);
                     setSelectedAssessment(assessment);
                     setQuestion(1);
                     setAnswer("");
                     setView("info");
                  }}
                >
                  Mulai Checkpoint
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
