"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ApiError, apiRequest } from "@/lib/api";
import { AuthShell } from "@/components/auth-shell";
import { AuthStatus } from "@/components/auth-status";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const data = new FormData(event.currentTarget);
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: String(data.get("email") ?? "").trim() }) });
      setSent(true);
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : new ApiError(0);
      setError(Object.values(failure.errors).flat().join(" ") || failure.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <AuthShell eyebrow="PEMULIHAN AKUN" title="Tenang, perjalanan belajarmu tetap tersimpan" description="Kami akan mengirimkan tautan pemulihan ke email yang terhubung dengan akun."><div className="auth-card-inner">{sent ? <AuthStatus tone="success" eyebrow="AUTH • EMAIL SENT" title="Tautan pemulihan sudah dikirim" marker="郵" description="Pesan tetap sama untuk email terdaftar maupun tidak terdaftar demi keamanan akun." items={["Email terdaftar", "Tautan sekali pakai", "Masa berlaku terbatas"]} primary={{ label: "Kembali ke Login", href: "/login" }} secondary={{ label: "Kirim Ulang" }} onSecondary={() => setSent(false)} /> : <><p className="kicker">LUPA KATA SANDI</p><h2>Pulihkan akses akunmu</h2><p className="auth-description">Masukkan email akun. Demi keamanan, hasil pengiriman menggunakan pesan yang sama untuk email terdaftar maupun tidak terdaftar.</p><form className="auth-form" onSubmit={submit} aria-busy={busy} aria-describedby={error ? "forgot-error" : undefined}><div className="auth-field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" placeholder="contoh@email.com" required /><small>Teks bantuan opsional</small></div><div className="recovery-security"><span aria-hidden="true">鍵</span><p>Tautan pemulihan berlaku terbatas demi menjaga keamanan akunmu.</p></div>{error && <p id="forgot-error" className="recovery-error" role="alert">{error}</p>}<div className="runner-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Memuat..." : "Kirim Tautan Reset"}</button><Link className="button button-dark" href="/login">Kembali ke Login</Link></div></form><div className="auth-announcement"><strong>Pengumuman</strong><p>Periksa inbox dan folder spam. Jangan pernah membagikan tautan reset kepada siapa pun.</p></div></>}</div></AuthShell>;
}
