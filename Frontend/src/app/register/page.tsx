"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { PublicPage } from "@/components/public-shell";
import { useAuth, type RegisterPayload } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { commercialSelection } from "@/lib/commercial-api";

function RegisterForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const placement = searchParams.get("placement");
  const planContext = searchParams.get("plan");
  const selection = commercialSelection(searchParams);

  const [visible, setVisible] = useState(false);
  const defaultTarget = placement && ["N1", "N2", "N3", "N4", "N5"].includes(placement) ? placement : "N4";
  const defaultPlan = planContext === "sensei" ? "Belajar dengan Sensei" : planContext === "lms" ? "Belajar Mandiri" : "Free Member";
  const [target, setTarget] = useState(defaultTarget);
  const [plan, setPlan] = useState(defaultPlan);

  const { register } = useAuth();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [whatsappError, setWhatsappError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const data = new FormData(event.currentTarget);
    const levels = ["N1", "N2", "N3", "N4", "N5"] as const;
    const targetJlpt = levels.find(level => level === target);
    if (!targetJlpt) return setError("Periksa target JLPT.");
    const password = String(data.get("password") ?? "");
    const payload: RegisterPayload = {
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      whatsapp: String(data.get("whatsapp") ?? "").trim(),
      password,
      password_confirmation: password,
      target_jlpt: targetJlpt,
    };
    const checkout = new URLSearchParams({ program: selection.level || (searchParams.get("program") ?? searchParams.get("level") ?? targetJlpt), plan: plan === "Belajar Mandiri" ? "lms" : "sensei" });
    const referral = String(data.get("referral") ?? "").trim();
    if (referral) checkout.set("referral", referral);
    const destination = plan === "Free Member" ? "/dashboard?membership=free" : `/checkout?${checkout}`;
    pending.current = true;
    setBusy(true);
    setError("");
    setWhatsappError("");
    try {
      await register(payload);
      router.replace(destination);
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : new ApiError(0);
      const phoneError = failure.errors.whatsapp?.join(" ") || "";
      setWhatsappError(phoneError);
      const otherErrors = Object.entries(failure.errors).filter(([field]) => field !== "whatsapp").flatMap(([, messages]) => messages).join(" ");
      setError(otherErrors || (phoneError ? "" : failure.message));
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="register-layout">
      <aside className="register-sidebar">
        <div className="register-sidebar-inner">
          <p className="kicker">LANGKAH PENDAFTARAN</p>
          <h2>Alur Pendaftaran</h2>
          <ol className="register-steps">
            <li>
              <strong>01</strong>
              <div>
                <h3>Buat akun</h3>
                <p>Isi data dasar dan preferensi belajar.</p>
              </div>
            </li>
            <li>
              <strong>02</strong>
              <div>
                <h3>Konfirmasi target &amp; program</h3>
                <p>Target ujian, level dan program dapat diubah setelah mendaftar.</p>
              </div>
            </li>
            <li>
              <strong>03</strong>
              <div>
                <h3>Hubungi admin</h3>
                <p>Selesaikan verifikasi invoice melalui WhatsApp.</p>
              </div>
            </li>
          </ol>
        </div>
      </aside>

      <section className="register-card">
        <header>
          <p className="kicker">BUAT AKUN</p>
          <h1>Pendaftaran Akun Baru</h1>
        </header>

        <form className="public-form register-form" onSubmit={submit} aria-busy={busy} aria-describedby={error ? "register-error" : undefined}>
          <div className="register-form-grid">
            <label>Nama Lengkap<input name="name" type="text" autoComplete="name" placeholder="Masukkan nama lengkap" required /></label>
            <label>Email<input name="email" type="email" autoComplete="email" placeholder="contoh@email.com" required /></label>
            <label>Nomor WhatsApp<input aria-label="Nomor WhatsApp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="+62 8xx xxxx xxxx" required aria-invalid={whatsappError ? true : undefined} aria-describedby={whatsappError ? "register-whatsapp-error" : undefined} onChange={() => setWhatsappError("")} />
              {whatsappError && <span id="register-whatsapp-error" className="recovery-error" role="alert">{whatsappError}</span>}
            </label>

            <div className="auth-field">
              <label htmlFor="password">Kata Sandi</label>
              <div className="password-wrap">
                <input id="password" name="password" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={8} placeholder="Minimal 8 karakter" />
                <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={visible}>
                  <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" />{visible && <path d="m4 4 16 16" />}</svg>
                </button>
              </div>
            </div>

            <label>Target Ujian
              <select name="target" value={target} onChange={(event) => setTarget(event.target.value)} required>
                {["N1", "N2", "N3", "N4", "N5"].map(level => <option key={level}>{level}</option>)}
              </select>
            </label>
            <label>Cara Belajar
              <select name="plan" value={plan} onChange={(event) => setPlan(event.target.value)} required>
                <option>Free Member</option>
                <option>Belajar Mandiri</option>
                <option>Belajar dengan Sensei</option>
              </select>
            </label>

            {plan !== "Free Member" && <label className="referral-field">Kode Referral (Opsional)<input name="referral" type="text" placeholder="Masukkan kode referral" />
              <small>Kode valid memberi diskon pada pembelian ini.</small>
            </label>}
          </div>

          <div className="register-actions">
            <p className="register-notice">Progres placement dan rekomendasi level akan disimpan pada akun.</p>
            {error && <p id="register-error" className="recovery-error" role="alert">{error}</p>}
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Memuat..." : "Buat Akun"}</button>
            <p className="auth-switch">Sudah punya akun? <Link className="text-link" href="/login">Masuk</Link></p>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <PublicPage active="Coba Gratis">
      <main className="public-main register-page-main">
        <Suspense fallback={<LoadingSkeleton variant="form" label="Memuat formulir..." />}>
          <RegisterForm />
        </Suspense>
      </main>
    </PublicPage>
  );
}
