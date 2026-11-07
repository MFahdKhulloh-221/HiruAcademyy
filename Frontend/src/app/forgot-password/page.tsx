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
  const dialog = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const restore = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("verification") === "required") {
        setNotice("Verifikasi OTP melalui email terlebih dahulu.");
      }
      // Tab-local UX only. Backend owns quota; no email or OTP stored in browser storage.
      try {
        const saved = JSON.parse(sessionStorage.getItem("hiru-recovery") || "null");
        if (saved && Number.isFinite(saved.deadline)) {
          deadline.current = saved.deadline;
          setSent(true);
          setRemaining(Math.max(0, Math.ceil((saved.deadline - Date.now()) / 1000)));
        }
      } catch { /* Storage unavailable: backend still enforces all limits. */ }
    }, 0);
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 250);
    return () => { window.clearTimeout(restore); window.clearInterval(timer); };
  }, []);

  async function request(verify: boolean) {
    if (pending.current || (!verify && remaining > 0)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ status: "accepted" | "cooldown" | "daily_limit_reached" | "ip_limited"; accepted: boolean; daily_limit_reached: boolean; retry_after: number }>(`/api/auth/${verify ? "verify-recovery-otp" : "forgot-password"}`, {
        method: "POST", body: JSON.stringify({ email: email.trim(), ...(verify ? { otp } : {}) }),
      });
      if (verify) {
        try { sessionStorage.removeItem("hiru-recovery"); } catch { /* Optional UX persistence. */ }
        router.push("/reset-password");
      }
      else {
        if (result.daily_limit_reached && (result.status === "daily_limit_reached" || result.status === "accepted")) dialog.current?.showModal();
        if (result.accepted && result.status === "accepted") {
          setSent(true);
          setOtp("");
        } else if (result.status === "cooldown") {
          setError("Tunggu sebelum meminta OTP kembali.");
        } else if (result.status === "ip_limited") {
          setError("Terlalu banyak permintaan dari jaringan ini. Silakan coba lagi nanti.");
        }
        if (result.status === "accepted" || result.status === "cooldown" || result.status === "ip_limited") {
          const seconds = Math.max(0, Math.min(60, result.retry_after));
          deadline.current = Date.now() + seconds * 1000;
          try { sessionStorage.setItem("hiru-recovery", JSON.stringify({ deadline: deadline.current })); } catch { /* Optional UX persistence. */ }
          setRemaining(seconds);
        }
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
    <dialog ref={dialog} aria-labelledby="daily-limit-title" className="auth-card-inner" style={{ maxWidth: "min(440px, 90vw)", padding: 24 }}>
      <h2 id="daily-limit-title">Batas OTP Harian Tercapai</h2>
      <p>Batas pengiriman OTP hari ini sudah tercapai. Silakan coba lagi besok. Jika permintaan terakhir diterima, kode terakhir tetap dapat digunakan sampai kedaluwarsa. Pergantian hari mengikuti WIB.</p>
      <form method="dialog"><button className="button button-primary" style={{ minHeight: 44 }}>Mengerti</button></form>
    </dialog>
    {notice && <p role="status">{notice}</p>}
    <p className="kicker">LUPA KATA SANDI</p><h2>{sent ? "Verifikasi kode OTP" : "Pulihkan akses akunmu"}</h2>
    <p className="auth-description">{sent ? "Jika akun tersedia, kode OTP dikirim melalui email. Kode berlaku 10 menit. Periksa inbox dan spam." : "Masukkan email akun. Respons sama untuk semua akun demi keamanan."}</p>
    <form className="auth-form" aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void request(sent); }}>
      <div className="auth-field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" maxLength={255} required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      {sent && <div className="auth-field"><label htmlFor="otp">Kode OTP 6 digit</label><input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} /><small>Jangan bagikan kode OTP kepada siapa pun.</small></div>}
      {error && <p className="recovery-error" role="alert">{error}</p>}
      <div className="runner-actions"><button className="button button-primary" type="submit" disabled={busy || (!sent && remaining > 0)}>{busy ? "Memuat..." : sent ? "Verifikasi OTP" : remaining > 0 ? `Kirim OTP dalam ${remaining} detik` : "Kirim OTP"}</button>
        {sent && <button className="button button-dark" type="button" disabled={busy || remaining > 0} onClick={() => void request(false)}>{remaining > 0 ? `Kirim ulang dalam ${remaining} detik` : "Kirim Ulang OTP"}</button>}
        <Link className="button button-dark" href="/login">Kembali ke Login</Link></div>
    </form>
  </div></AuthShell>;
}
