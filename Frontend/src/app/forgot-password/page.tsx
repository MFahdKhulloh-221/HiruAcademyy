"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiRequest } from "@/lib/api";
import { AuthShell } from "@/components/auth-shell";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, []);

  async function request(verify: boolean) {
    if (pending.current || (!verify && remaining > 0)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/auth/${verify ? "verify-recovery-otp" : "forgot-password"}`, {
        method: "POST", body: JSON.stringify({ email: email.trim(), ...(verify ? { otp } : {}) }),
      });
      if (verify) router.push("/reset-password");
      else {
        setSent(true);
        setOtp("");
        deadline.current = Date.now() + 60000;
        setRemaining(60);
      }
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : new ApiError(0);
      setError(verify && failure.status === 422 ? "Kode tidak valid atau kedaluwarsa. Maksimal 5 kesalahan; minta kode baru bila perlu." : Object.values(failure.errors).flat().join(" ") || failure.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <AuthShell eyebrow="PEMULIHAN AKUN" title="Tenang, perjalanan belajarmu tetap tersimpan" description="Pulihkan akun melalui kode OTP email."><div className="auth-card-inner">
    <p className="kicker">LUPA KATA SANDI</p><h2>{sent ? "Verifikasi kode OTP" : "Pulihkan akses akunmu"}</h2>
    <p className="auth-description">{sent ? "Jika akun tersedia, kode OTP dikirim melalui email. Kode berlaku 10 menit. Periksa inbox dan spam." : "Masukkan email akun. Respons sama untuk semua akun demi keamanan."}</p>
    <form className="auth-form" aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void request(sent); }}>
      <div className="auth-field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" maxLength={255} required value={email} readOnly={sent} onChange={(event) => setEmail(event.target.value)} /></div>
      {sent && <div className="auth-field"><label htmlFor="otp">Kode OTP 6 digit</label><input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} /><small>Jangan bagikan kode OTP kepada siapa pun.</small></div>}
      {error && <p className="recovery-error" role="alert">{error}</p>}
      <div className="runner-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Memuat..." : sent ? "Verifikasi OTP" : "Kirim OTP"}</button>
        {sent && <button className="button button-dark" type="button" disabled={busy || remaining > 0} onClick={() => void request(false)}>{remaining > 0 ? `Kirim ulang dalam ${remaining} detik` : "Kirim Ulang OTP"}</button>}
        <Link className="button button-dark" href="/login">Kembali ke Login</Link></div>
    </form>
  </div></AuthShell>;
}
