"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { startAttempt } from "@/lib/assessment-attempt";
import { PublicPage } from "@/components/public-shell";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { usePublishedPlacement } from "@/lib/placement-store";

const outcomes = [
  ["Analisis 4 kemampuan", "Lihat hasil Bunpou, Moji・Goi, Dokkai, dan Choukai."],
  ["Rekomendasi level", "Dapatkan rekomendasi level N5–N1 sesuai hasil tesmu."],
  ["Fokus yang perlu diperbaiki", "Temukan kemampuan yang sudah kuat dan bagian yang perlu kamu prioritaskan."],
];

export default function PlacementPage() {
  const { config: publishedConfig, loading, error: loadError } = usePublishedPlacement();
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [target, setTarget] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isReady = Boolean(publishedConfig && publishedConfig.isReady && !loadError);
  const unavailableNotice = loadError || (!publishedConfig || !publishedConfig.isReady ? "Placement Test sedang disiapkan. Silakan coba lagi nanti." : undefined);
  const valid = Boolean(name.trim() && whatsapp.trim() && target && privacy && isReady && !busy);

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) errors.name = "Mohon isi nama lengkap kamu (minimal 2 huruf).";
    else if (/[^a-zA-Z\s.'À-ÖØ-öø-ÿ]/.test(trimmed)) errors.name = "Nama hanya boleh berisi huruf, spasi, dan titik. Tidak boleh ada angka atau simbol.";
    const digits = whatsapp.replace(/[\s\-()]/g, "");
    if (!/^\+?(?:62|0)8?\d{8,13}$/.test(digits)) errors.whatsapp = "Nomor WhatsApp belum benar. Contoh: 081234567890 atau +6281234567890.";
    if (!target) errors.target = "Pilih salah satu target ujian yang kamu tuju.";
    if (!privacy) errors.privacy = "Kamu perlu menyetujui Kebijakan Privasi untuk melanjutkan.";
    return errors;
  }

  function clearFieldError(field: string) {
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  const introHeading = publishedConfig?.introHeading?.trim() || "Placement Test";
  const description = publishedConfig?.description?.trim() || "Kenali kemampuan bahasa Jepangmu untuk mendapatkan rekomendasi level belajar.";
  const questionCount = publishedConfig?.questionCount ?? "—";
  const durationMinutes = publishedConfig?.durationMinutes;
  const instructions = [
    "Pilih satu jawaban untuk setiap soal.",
    publishedConfig?.adaptive === true
      ? "Jawaban tersimpan saat dipilih. Soal berikutnya menyesuaikan jawabanmu; jawaban sebelumnya tidak dapat diubah."
      : publishedConfig?.adaptive === false
        ? "Gunakan Lanjut Soal dan Sebelumnya untuk berpindah soal. Jawaban dapat diubah sebelum tes diselesaikan."
        : "Ikuti tombol navigasi yang tersedia saat mengerjakan tes.",
    ...(typeof durationMinutes === "number" && Number.isFinite(durationMinutes) && durationMinutes > 0 ? [`Selesaikan tes dalam ${durationMinutes} menit. Pantau sisa waktu saat mengerjakan.`] : []),
  ];

  if (loading) return <PublicPage active="Placement Test"><main className="public-main placement-page"><LoadingSkeleton variant="form" /></main></PublicPage>;
  return (
    <PublicPage active="Placement Test">
      <main className="public-main placement-page">
        <section className="placement-hero-card">
          <div className="placement-hero-copy">
            <p className="kicker">PLACEMENT TEST</p>
            {introHeading && <h1>{introHeading}</h1>}
            <p>{description}</p>
            <div className="public-pills">
              <span>Gratis</span>
              <span>{questionCount} soal{typeof durationMinutes === "number" && Number.isFinite(durationMinutes) && durationMinutes > 0 ? ` | ${durationMinutes} menit` : ""}</span>
              <span>Hasil langsung</span>
            </div>
            <div className="result-actions">
              <Link className="button button-primary placement-start-cta" href="#placement-form">Mulai Tes</Link>
            </div>
          </div>
          <aside className="placement-outcomes">
            <p className="kicker">HASIL YANG KAMU DAPATKAN</p>
            {outcomes.map(([title, description], index) => (
              <article key={title}>
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                <div>
                  <h2>{title}</h2>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </aside>
        </section>

        <section className="placement-form-card" id="placement-form">
          {!isReady && (
            <div
              className="placement-notice"
              role="alert"
              style={{
                gridColumn: "1 / -1",
                display: "block",
                background: "#fff7ed",
                color: "#9a3412",
                border: "1.5px solid #fed7aa",
                fontWeight: 500,
              }}
            >
              <strong style={{ display: "block", marginBottom: "4px", color: "#7c2d12" }}>Placement Test Belum Tersedia</strong>
              <p style={{ margin: 0 }}>{unavailableNotice}</p>
            </div>
          )}
          <div className="placement-form-guide">
            <div className="placement-form-guide-head">
              <h2>Siap Cek Level Bahasa Jepangmu?</h2>
              <p>Isi data singkat untuk memulai. Hasil dan rekomendasi level akan tampil langsung setelah tes selesai.</p>
            </div>

            <aside className="placement-guide-tips">
              <p className="kicker">SEBELUM MULAI</p>
              <h3>Petunjuk pengerjaan</h3>
              <div className="placement-guide-reminders">
                {instructions.map((text, index) => (
                  <article key={index}>
                    <span aria-hidden="true">{index + 1}</span>
                    <p>{text}</p>
                  </article>
                ))}
              </div>
            </aside>
          </div>

            <form className="public-form" onSubmit={async event => {
              event.preventDefault();
              if (pending.current) return;
              const errors = validate();
              setFieldErrors(errors);
              if (Object.keys(errors).length > 0) {
                const firstKey = Object.keys(errors)[0];
                const el = document.querySelector<HTMLElement>(`[name="${firstKey}"]`);
                el?.focus();
                return;
              }
              if (!valid) return;
              pending.current = true;
              setBusy(true);
              setError(undefined);
              try {
                const attempt = await startAttempt("/api/placement/attempts", { name, whatsapp, target, privacy, whatsappConsent });
                router.push(`/placement/question?attempt=${attempt.id}`);
              } catch (cause) {
                if (cause instanceof ApiError && cause.errors?.availability) {
                  setError(cause.errors.availability[0] || "Placement Test sedang disiapkan. Silakan coba lagi nanti.");
                } else if (cause instanceof Error && (cause.message.includes("disiapkan") || cause.message.includes("Bank adaptif") || cause.message.includes("mencukupi"))) {
                  setError("Placement Test sedang disiapkan. Silakan coba lagi nanti.");
                } else {
                  setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi.");
                }
                pending.current = false;
                setBusy(false);
              }
            }}>
              {(error || loadError) && <p role="alert" className="placement-error-alert">{error || loadError}</p>}
            <p className="kicker">DATA SEBELUM TES</p>
            <label>
              Nama
              <input name="name" placeholder="Masukkan nama" value={name} onChange={(event) => { setName(event.target.value); clearFieldError("name"); }} required aria-invalid={!!fieldErrors.name || undefined} aria-describedby={fieldErrors.name ? "err-name" : undefined} />
              {fieldErrors.name && <em id="err-name" role="alert">{fieldErrors.name}</em>}
            </label>
            <label>
              Nomor WhatsApp
              <input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="+62 8xx xxxx xxxx" value={whatsapp} onChange={(event) => { setWhatsapp(event.target.value); clearFieldError("whatsapp"); }} required aria-invalid={!!fieldErrors.whatsapp || undefined} aria-describedby={fieldErrors.whatsapp ? "err-whatsapp" : undefined} />
              {fieldErrors.whatsapp && <em id="err-whatsapp" role="alert">{fieldErrors.whatsapp}</em>}
            </label>
            <label>
              Target Ujian
              <select name="target" value={target} onChange={(event) => { setTarget(event.target.value); clearFieldError("target"); }} required aria-invalid={!!fieldErrors.target || undefined} aria-describedby={fieldErrors.target ? "err-target" : undefined}>
                <option value="" disabled>Pilih target ujian</option>
                {["Belum menentukan", "N5", "N4", "N3", "N2", "N1"].map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
              {fieldErrors.target && <em id="err-target" role="alert">{fieldErrors.target}</em>}
            </label>
            <label className="consent">
              <input type="checkbox" name="privacy" checked={privacy} onChange={(event) => { setPrivacy(event.target.checked); clearFieldError("privacy"); }} required />
              <span>Saya menyetujui pemrosesan data sesuai <Link href="/kebijakan-privasi">Kebijakan Privasi</Link>.</span>
              {fieldErrors.privacy && <em id="err-privacy" role="alert">{fieldErrors.privacy}</em>}
            </label>
            <label className="consent">
              <input type="checkbox" name="whatsappConsent" checked={whatsappConsent} onChange={(event) => setWhatsappConsent(event.target.checked)} />
              <span>Saya bersedia menerima penjelasan hasil dan informasi program Hiru Academy melalui WhatsApp.</span>
            </label>
            <button className="button button-primary" type="submit" disabled={!isReady || !valid}>Mulai Placement Test Gratis</button>
          </form>
        </section>
      </main>
    </PublicPage>
  );
}
