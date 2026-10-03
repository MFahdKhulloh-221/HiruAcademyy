"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { authDestination, useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  const { login } = useAuth();
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
      const user = await login(String(data.get("identity") ?? "").trim(), String(data.get("password") ?? ""));
      router.replace(authDestination(user));
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : new ApiError(0);
      setError(failure.status === 422 || failure.status === 401 ? "Email/WhatsApp atau kata sandi tidak sesuai." : failure.message);
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="KEMBALI KE PERJALANAN BELAJARMU"
      title="Lanjutkan Belajarmu dari Progres Terakhir"
      description="Materi, latihan, rekaman kelas, dan evaluasimu tersimpan rapi dalam satu akun Hiru Academy."
    >
      <div className="auth-card-inner">
        <h2>Masuk ke Hiru Academy</h2>
        <p className="auth-description">Gunakan email atau nomor WhatsApp dan kata sandimu.</p>

        <form className="auth-form" onSubmit={submit} aria-busy={busy} aria-describedby={error ? "login-error" : undefined}>
          <div className="auth-field">
            <label htmlFor="identity">Email / WhatsApp</label>
            <input id="identity" name="identity" type="text" autoComplete="username" placeholder="email atau nomor WhatsApp" required />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Kata Sandi</label>
            <div className="password-wrap">
              <input id="password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" placeholder="Masukkan kata sandi" required />
              <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={visible}>
                <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" />{visible && <path d="m4 4 16 16" />}</svg>
              </button>
            </div>
            <small>Lupa kata sandi? <Link className="text-link" href="/forgot-password">Gunakan alur pemulihan akun.</Link></small>
          </div>

          {error && <p id="login-error" className="recovery-error" role="alert">{error}</p>}
          <button className="auth-submit button button-primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: "10px" }}>{busy ? "Memuat..." : "Masuk"}</button>

          <p className="auth-switch">Belum punya akun? <Link className="text-link" href="/register">Daftar</Link></p>
        </form>

      </div>
    </AuthShell>
  );
}
