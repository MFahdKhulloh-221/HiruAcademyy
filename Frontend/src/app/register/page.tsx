"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { PublicPage } from "@/components/public-shell";
import { useAuth, type RegisterPayload } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { safeAuthDestination } from "@/lib/auth-destination";
import { commercialCode } from "@/lib/commercial-api";
import { useContent, type PublicOffer } from "@/lib/public-content-api";
import { readRegistrationDraft, writeRegistrationDraft } from "@/lib/registration-draft";
import { readRegistrationIntent, writeRegistrationIntent } from "@/lib/registration-intent";

function RegisterForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { register, user, authenticated, loading: authLoading } = useAuth();
  const editingSelection = searchParams.get("edit") === "selection" && authenticated && Boolean(user);
  const next = safeAuthDestination(searchParams.get("next"));
  const checkoutContext = next?.startsWith("/checkout?") ? new URLSearchParams(next.slice(next.indexOf("?") + 1)) : null;
  const placement = searchParams.get("placement");
  const planContext = searchParams.get("plan") ?? checkoutContext?.get("plan") ?? null;
  const programContext = searchParams.get("program") ?? searchParams.get("level") ?? checkoutContext?.get("program") ?? placement;
  const [referral, setReferral] = useState(searchParams.get("referral") ?? checkoutContext?.get("referral") ?? "");
  const selection = { level: commercialCode(programContext ?? "") };

  const [visible, setVisible] = useState(false);
  const requestedTarget = editingSelection ? user?.target_jlpt : selection.level || placement?.toUpperCase();
  const defaultTarget = requestedTarget && ["N1", "N2", "N3", "N4", "N5"].includes(requestedTarget) ? requestedTarget : "N4";
  const defaultPlan = planContext === "sensei" ? "Belajar dengan Sensei" : planContext === "lms" ? "Belajar Mandiri" : "Free Member";
  const contextKey = `${selection.level}/${planContext ?? ""}`;
  const [preferences, setPreferences] = useState<{ key: string; target: string; plan: string; program?: string }>();
  const target = preferences?.key === contextKey ? preferences.target : defaultTarget;
  const plan = preferences?.key === contextKey ? preferences.plan : defaultPlan;
  const offers = useContent<PublicOffer>("/api/public/offers");
  const selectedProgram = (preferences?.key === contextKey ? preferences.program : undefined) || selection.level || target;
  const paidPlan = plan === "Belajar Mandiri" ? "lms" : "sensei";
  const checkingSelection = plan !== "Free Member";
  const selectedOffer = offers.data.find(offer => commercialCode(offer.program.code) === selectedProgram && offer.plan_code === paidPlan);
  const invalidSelection = checkingSelection && !selectedOffer;
  const selectionBlocked = invalidSelection || (checkingSelection && (offers.loading || Boolean(offers.error)));

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
  const selectionQuery = new URLSearchParams({ program: selectedProgram, plan: plan === "Free Member" ? "free" : paidPlan });
  if (referral.trim()) selectionQuery.set("referral", referral.trim());
  const loginQuery = new URLSearchParams(selectionQuery);
  const summaryHref = `/program?${selectionQuery}#program-summary`;
  const checkout = new URLSearchParams(checkoutContext ?? undefined);
  checkout.set("program", selectedProgram);
  checkout.set("plan", paidPlan);
  if (referral.trim()) checkout.set("referral", referral.trim());
  else checkout.delete("referral");
  const destination = plan === "Free Member" ? (next?.startsWith("/checkout") ? "/dashboard?membership=free" : next ?? "/dashboard?membership=free") : next?.startsWith("/invoice") ? next : `/checkout?${checkout}`;
  const loginNext = safeAuthDestination(destination);
  if (loginNext) loginQuery.set("next", loginNext);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!authLoading && authenticated && user && !busy && !editingSelection) {
      const explicitSelection = ["next", "plan", "program", "level", "placement"].some(key => searchParams.has(key));
      router.replace((!explicitSelection && readRegistrationIntent(user.id)) || destination);
    }
  }, [authLoading, authenticated, user, busy, editingSelection, router, destination, searchParams]);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [whatsappError, setWhatsappError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || selectionBlocked || authLoading) return;
    if (authenticated) {
      if (!editingSelection || !user) return;
      pending.current = true;
      setBusy(true);
      writeRegistrationIntent(user.id, destination);
      router.replace(destination);
      return;
    }
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
    pending.current = true;
    setBusy(true);
    setError("");
    setWhatsappError("");
    setEmailError("");
    try {
      const account = await register(payload);
      writeRegistrationIntent(account.id, destination);
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
                <p>Target ujian adalah preferensi belajar, bukan program yang dibeli.</p>
              </div>
            </li>
            <li>
              <strong>03</strong>
              <div>
                <h3>{plan === "Free Member" ? "Mulai belajar gratis" : "Lanjut ke checkout"}</h3>
                <p>{plan === "Free Member" ? "Akses Free Member tanpa pembelian atau invoice." : "Periksa pembelian di checkout, lalu ikuti petunjuk invoice."}</p>
              </div>
            </li>
          </ol>
        </div>
      </aside>

      <section className="register-card">
        <header>
          <p className="kicker">BUAT AKUN</p>
          <h1>{editingSelection ? "Ubah Pilihan Belajar" : "Pendaftaran Akun Baru"}</h1>
          {editingSelection && <p>Akun Anda sudah terdaftar. Data pribadi dan target ujian tetap tersimpan; tidak perlu mengisi kata sandi atau membuat akun baru.</p>}
        </header>

        <form ref={formRef} className="public-form register-form" onInput={event => {
          if (!editingSelection && event.target instanceof HTMLInputElement && ["name", "email", "whatsapp"].includes(event.target.name)) writeRegistrationDraft(event.currentTarget);
        }} onSubmit={submit} aria-busy={busy} aria-describedby={error ? "register-error" : undefined}>
          <div className="register-form-grid">
            <label>Nama Lengkap<input name="name" value={editingSelection ? user?.name ?? "" : undefined} readOnly={editingSelection} type="text" autoComplete="name" placeholder="Masukkan nama lengkap" required /></label>
            <label>Email<input aria-label="Email" name="email" value={editingSelection ? user?.email ?? "" : undefined} readOnly={editingSelection} type="email" autoComplete="email" placeholder="contoh@email.com" required aria-invalid={emailError ? true : undefined} aria-describedby={emailError ? "register-email-error" : undefined} onChange={() => setEmailError("")} />
              {emailError && <span id="register-email-error" className="recovery-error" role="alert">{emailError}</span>}
            </label>
            <label>Nomor WhatsApp<input aria-label="Nomor WhatsApp" name="whatsapp" value={editingSelection ? user?.whatsapp ?? "" : undefined} readOnly={editingSelection} type="tel" inputMode="tel" autoComplete="tel" placeholder="+62 8xx xxxx xxxx" required aria-invalid={whatsappError ? true : undefined} aria-describedby={whatsappError ? "register-whatsapp-error" : undefined} onChange={() => setWhatsappError("")} />
              {whatsappError && <span id="register-whatsapp-error" className="recovery-error" role="alert">{whatsappError}</span>}
            </label>

            {!editingSelection && <div className="auth-field">
              <label htmlFor="password">Kata Sandi</label>
              <div className="password-wrap">
                <input id="password" name="password" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={8} placeholder="Minimal 8 karakter" />
                <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={visible}>
                  <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" />{visible && <path d="m4 4 16 16" />}</svg>
                </button>
              </div>
            </div>}

            <label>Target Ujian
              <select name="target" disabled={editingSelection} value={editingSelection ? user?.target_jlpt ?? "" : target} onChange={(event) => setPreferences({ key: contextKey, target: event.target.value, plan })} required>
                {editingSelection && !user?.target_jlpt && <option value="">Belum ditentukan</option>}
                {["N1", "N2", "N3", "N4", "N5"].map(level => <option key={level}>{level}</option>)}
              </select>
            </label>
            {editingSelection && <label>Program
              <select aria-label="Program" name="program" value={selectedProgram} onChange={event => setPreferences({ key: contextKey, target, plan, program: event.target.value })} required>
                {Array.from(new Set([selectedProgram, ...offers.data.map(offer => commercialCode(offer.program.code))])).map(program => <option key={program} value={program}>JLPT {program}</option>)}
              </select>
            </label>}
            <label>Cara Belajar
              <select name="plan" value={plan} onChange={(event) => setPreferences({ key: contextKey, target, plan: event.target.value, program: editingSelection ? selectedProgram : undefined })} required>
                <option>Free Member</option>
                <option>Belajar Mandiri</option>
                <option>Belajar dengan Sensei</option>
              </select>
            </label>

            {plan !== "Free Member" && <label className="referral-field">Kode Referral (Opsional)<input name="referral" type="text" value={referral} onChange={event => setReferral(event.target.value)} placeholder="Masukkan kode referral" />
            </label>}
          </div>

          <div className="register-actions">
            {error && <p id="register-error" className="recovery-error" role="alert">{error}</p>}
            {checkingSelection && offers.loading && <p role="status">Memeriksa penawaran…</p>}
            {checkingSelection && offers.error && <p role="alert">{offers.error} <button type="button" onClick={offers.reload}>Coba lagi</button></p>}
            {!offers.loading && !offers.error && invalidSelection && <p role="alert">Pilihan program atau paket tidak tersedia. Kembali ke Ringkasan Pilihan untuk memilih ulang.</p>}
            <button className="button button-primary" type="submit" disabled={busy || selectionBlocked}>{busy ? "Memuat..." : editingSelection ? "Lanjut ke Checkout" : "Buat Akun"}</button>
            <Link className="text-link" href={summaryHref}>Kembali ke Ringkasan Pilihan</Link>
            {!editingSelection && <p className="auth-switch">Sudah punya akun? <Link className="text-link" href={`/login?${loginQuery}`}>Masuk</Link></p>}
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
