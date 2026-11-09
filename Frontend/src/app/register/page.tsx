"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { PublicPage } from "@/components/public-shell";
import { useAuth, type RegisterPayload } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { freeChapterDestination } from "@/lib/free-chapter";
import { commercialCode } from "@/lib/commercial-api";
import { useContent, type PublicOffer } from "@/lib/public-content-api";
import { readRegistrationDraft, writeRegistrationDraft } from "@/lib/registration-draft";

function RegisterForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const next = freeChapterDestination(searchParams.get("next"));
  const placement = searchParams.get("placement");
  const planContext = searchParams.get("plan");
  const programContext = searchParams.get("program") ?? searchParams.get("level") ?? placement;
  const selection = { level: commercialCode(programContext ?? "") };

  const [visible, setVisible] = useState(false);
  const requestedTarget = selection.level || placement?.toUpperCase();
  const defaultTarget = requestedTarget && ["N1", "N2", "N3", "N4", "N5"].includes(requestedTarget) ? requestedTarget : "N4";
  const defaultPlan = planContext === "sensei" ? "Belajar dengan Sensei" : planContext === "lms" ? "Belajar Mandiri" : "Free Member";
  const contextKey = `${selection.level}/${planContext ?? ""}`;
  const [preferences, setPreferences] = useState<{ key: string; target: string; plan: string }>();
  const target = preferences?.key === contextKey ? preferences.target : defaultTarget;
  const plan = preferences?.key === contextKey ? preferences.plan : defaultPlan;
  const offers = useContent<PublicOffer>("/api/public/offers");
  const hasSelection = Boolean(searchParams.get("program") || searchParams.get("level") || placement);
  const selectedProgram = (selection.level || placement || "").toUpperCase();
  const paidPlan = plan === "Belajar Mandiri" ? "lms" : "sensei";
  const invalidSelection = (hasSelection && !planContext) || (planContext !== null && (!hasSelection || !["free", "lms", "sensei"].includes(planContext))) || (hasSelection && (plan === "Free Member" ? !/^N[1-5]$/.test(selectedProgram) : !offers.data.some(offer => commercialCode(offer.program.code) === selectedProgram && offer.plan_code === paidPlan)));
  const checkingSelection = hasSelection && plan !== "Free Member";
  const selectionBlocked = invalidSelection || (checkingSelection && (offers.loading || Boolean(offers.error)));

  const { register, authenticated, loading: authLoading } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (authLoading || authenticated) return;
    const draft = readRegistrationDraft();
    if (!draft) return;
    for (const field of ["name", "email", "whatsapp"] as const) {
      const input = formRef.current?.elements.namedItem(field);
      if (input instanceof HTMLInputElement && !input.value) input.value = draft[field];
    }
  }, [authLoading, authenticated]);
  const selectionQuery = new URLSearchParams({ ...(selection.level ? { program: selection.level } : placement ? { placement } : {}), ...(planContext ? { plan: planContext } : {}) });
  const summaryHref = `/program?${selectionQuery}#program-summary`;
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!authLoading && authenticated && !busy) router.replace(next ?? (selection.level && planContext ? summaryHref : "/dashboard"));
  }, [authLoading, authenticated, busy, router, selection.level, planContext, summaryHref, next]);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [whatsappError, setWhatsappError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || selectionBlocked) return;
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
    if (referral) { checkout.set("referral", referral); payload.referral_code = referral; }
    const destination = plan === "Free Member" ? next ?? "/dashboard?membership=free" : `/checkout?${checkout}`;
    pending.current = true;
    setBusy(true);
    setError("");
    setWhatsappError("");
    setEmailError("");
    try {
      await register(payload);
      router.replace(destination);
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : new ApiError(0);
      const phoneError = failure.errors.whatsapp?.join(" ") || "";
      setWhatsappError(phoneError);
      const mailError = failure.errors.email?.join(" ") || "";
      setEmailError(mailError);
      const otherErrors = Object.entries(failure.errors).filter(([field]) => field !== "whatsapp" && field !== "email").flatMap(([, messages]) => messages).join(" ");
      setError(otherErrors || (phoneError || mailError ? "" : failure.message));
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

        <form ref={formRef} className="public-form register-form" onInput={event => {
          if (event.target instanceof HTMLInputElement && ["name", "email", "whatsapp"].includes(event.target.name)) writeRegistrationDraft(event.currentTarget);
        }} onSubmit={submit} aria-busy={busy} aria-describedby={error ? "register-error" : undefined}>
          <div className="register-form-grid">
            <label>Nama Lengkap<input name="name" type="text" autoComplete="name" placeholder="Masukkan nama lengkap" required /></label>
            <label>Email<input aria-label="Email" name="email" type="email" autoComplete="email" placeholder="contoh@email.com" required aria-invalid={emailError ? true : undefined} aria-describedby={emailError ? "register-email-error" : undefined} onChange={() => setEmailError("")} />
              {emailError && <span id="register-email-error" className="recovery-error" role="alert">{emailError}</span>}
            </label>
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
              <select name="target" value={target} onChange={(event) => setPreferences({ key: contextKey, target: event.target.value, plan })} required>
                {["N1", "N2", "N3", "N4", "N5"].map(level => <option key={level}>{level}</option>)}
              </select>
            </label>
            <label>Cara Belajar
              <select name="plan" value={plan} onChange={(event) => setPreferences({ key: contextKey, target, plan: event.target.value })} required>
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
            {error && <p id="register-error" className="recovery-error" role="alert">{error}</p>}
            {checkingSelection && offers.loading && <p role="status">Memeriksa penawaran…</p>}
            {checkingSelection && offers.error && <p role="alert">{offers.error} <button type="button" onClick={offers.reload}>Coba lagi</button></p>}
            {!offers.loading && !offers.error && invalidSelection && <p role="alert">Pilihan program atau paket tidak tersedia. Kembali ke Ringkasan Pilihan untuk memilih ulang.</p>}
            <button className="button button-primary" type="submit" disabled={busy || selectionBlocked}>{busy ? "Memuat..." : "Buat Akun"}</button>
            <Link className="text-link" href={summaryHref}>Kembali ke Ringkasan Pilihan</Link>
            <p className="auth-switch">Sudah punya akun? <Link className="text-link" href={`/login?${next ? new URLSearchParams({ next }) : selectionQuery}`}>Masuk</Link></p>
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
