"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAttempt } from "@/lib/assessment-attempt";
import { PublicPage } from "@/components/public-shell";
import { usePublishedPlacement } from "@/lib/placement-store";

const outcomes = [
  ["Analisis 4 kemampuan", "Lihat hasil Bunpou, Moji・Goi, Dokkai, dan Choukai."],
  ["Rekomendasi level", "Dapatkan rekomendasi level N5–N1 sesuai hasil tesmu."],
  ["Fokus yang perlu diperbaiki", "Temukan kemampuan yang sudah kuat dan bagian yang perlu kamu prioritaskan."],
];

const reminders = [
  {
    icon: (
      <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    ),
    text: "Aktifkan audio atau gunakan earphone untuk soal Choukai.",
  },
  {
    icon: (
      <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    text: "Kerjakan tanpa kamus, penerjemah, atau bantuan orang lain.",
  },
  {
    icon: (
      <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    text: "Selesaikan seluruh soal dalam satu sesi.",
  },
];

export default function PlacementPage() {
  const { config: publishedConfig, error: loadError } = usePublishedPlacement();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [target, setTarget] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const valid = Boolean(name.trim() && whatsapp.trim() && target && privacy && publishedConfig && !busy);

  const introHeading = publishedConfig?.introHeading ?? "";
  const description = publishedConfig?.description ?? "";
  const questionCount = publishedConfig?.questions.length ?? "—";
  const durationMinutes = publishedConfig?.durationMinutes ?? "—";

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
              <span>{questionCount} soal | ±{durationMinutes} menit</span>
              <span>Hasil langsung</span>
            </div>
            <div className="result-actions">
              <a className="button button-primary placement-start-cta" href="#placement-form">Mulai Tes</a>
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
          <div className="placement-form-guide">
            <div className="placement-form-guide-head">
              <h2>Siap Cek Level Bahasa Jepangmu?</h2>
              <p>Isi data singkat untuk memulai. Hasil dan rekomendasi level akan tampil langsung setelah tes selesai.</p>
            </div>

            <aside className="placement-guide-tips">
              <p className="kicker">SEBELUM MULAI</p>
              <h3>Agar hasil tes lebih akurat:</h3>
              <div className="placement-guide-reminders">
                {reminders.map((item, index) => (
                  <article key={index}>
                    <span aria-hidden="true">{item.icon}</span>
                    <p>{item.text}</p>
                  </article>
                ))}
              </div>
            </aside>
          </div>

            <form className="public-form" onSubmit={async event => {
              event.preventDefault();
              if (!valid) return;
              setBusy(true);
              setError(undefined);
              try {
                const attempt = await startAttempt("/api/placement/attempts", { name, whatsapp, target, privacy, whatsappConsent });
                router.push(`/placement/question?attempt=${attempt.id}`);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi.");
                setBusy(false);
              }
            }}>
              {(error || loadError) && <p role="alert">{error || loadError}</p>}
            <p className="kicker">DATA SEBELUM TES</p>
            <label>
              Nama
              <input name="name" placeholder="Masukkan nama" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Nomor WhatsApp
              <input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="+62 8xx xxxx xxxx" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} required />
            </label>
            <label>
              Target Ujian
              <select name="target" value={target} onChange={(event) => setTarget(event.target.value)} required>
                <option value="" disabled>Pilih target ujian</option>
                {["Belum menentukan", "N5", "N4", "N3", "N2", "N1"].map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </label>
            <label className="consent">
              <input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} required />
              <span>Saya menyetujui pemrosesan data sesuai <Link href="/kebijakan-privasi">Kebijakan Privasi</Link>.</span>
            </label>
            <label className="consent">
              <input type="checkbox" name="whatsappConsent" checked={whatsappConsent} onChange={(event) => setWhatsappConsent(event.target.checked)} />
              <span>Saya bersedia menerima penjelasan hasil dan informasi program Hiru Academy melalui WhatsApp.</span>
            </label>
            <button className="button button-primary" type="submit" disabled={!valid}>Mulai Placement Test Gratis</button>
          </form>
        </section>
      </main>
    </PublicPage>
  );
}
