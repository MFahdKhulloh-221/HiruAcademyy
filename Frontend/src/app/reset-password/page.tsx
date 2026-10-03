"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { ApiError, apiRequest } from "@/lib/api";
import { AuthShell } from "@/components/auth-shell";
import { AuthStatus } from "@/components/auth-status";

function ResetPasswordContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const email = params.get("email");
  const [invalid, setInvalid] = useState(false);
  const expired = invalid || !token?.trim() || !email?.trim() || token.length > 255 || email.length > 255 || params.get("state") === "expired";
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || expired) return;
    if (password.length < 8) return setError("Kata sandi minimal 8 karakter.");
    if (password !== confirmation) return setError("Konfirmasi kata sandi tidak sama.");
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ email, token, password, password_confirmation: confirmation }) });
      setPassword("");
      setConfirmation("");
      router.replace("/login");
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : new ApiError(0);
      if (failure.status === 422 && (failure.errors.token || !Object.keys(failure.errors).length)) setInvalid(true);
      else setError(Object.values(failure.errors).flat().join(" ") || failure.message);
      pending.current = false;
      setBusy(false);
    }
  }

  if (expired) return <AuthStatus tone="error" eyebrow="AUTH • LINK EXPIRED" title="Tautan reset sudah tidak berlaku" marker="期" description="Tautan mungkin telah digunakan, melewati masa berlaku, atau dibatalkan oleh sistem." items={["Tidak ada perubahan akun", "Token tidak dapat digunakan ulang", "Request baru diperlukan"]} primary={{ label: "Minta Tautan Baru", href: "/forgot-password" }} secondary={{ label: "Kembali Login", href: "/login" }} />;

  return <><p className="kicker">RESET KATA SANDI</p><h2>Tetapkan kata sandi baru</h2><p className="auth-description">Masukkan kata sandi baru untuk mengamankan kembali akunmu.</p><form className="auth-form" onSubmit={submit} aria-busy={busy} aria-describedby={error ? "reset-error" : undefined}><div className="auth-field"><label htmlFor="password">Kata Sandi Baru</label><div className="password-wrap"><input id="password" name="password" type={visible ? "text" : "password"} autoComplete="new-password" placeholder="Masukkan kata sandi baru" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}><span aria-hidden="true">◉</span></button></div><small>Teks bantuan opsional</small></div><div className="auth-field"><label htmlFor="confirmation">Konfirmasi Kata Sandi</label><input id="confirmation" name="confirmation" type={visible ? "text" : "password"} autoComplete="new-password" placeholder="Ulangi kata sandi baru" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} /><small>Teks bantuan opsional</small></div><div className="password-guidance"><strong>KEKUATAN KATA SANDI</strong><ul><li>✓ Minimal 8 karakter</li><li>✓ Huruf besar &amp; kecil</li><li>✓ Angka</li><li>✓ Simbol disarankan</li></ul></div>{error && <p id="reset-error" className="recovery-error" role="alert">{error}</p>}<div className="runner-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Memuat..." : "Simpan Kata Sandi"}</button><Link className="button button-dark" href="/forgot-password">Kirim Ulang Tautan</Link></div></form><div className="auth-announcement"><strong>Pengumuman</strong><p>Setelah berhasil, sesi lama dapat dihentikan dan kamu perlu login kembali.</p></div></>;
}

export default function ResetPasswordPage() {
  return <AuthShell eyebrow="KEAMANAN AKUN" title="Buat kata sandi baru yang lebih kuat" description="Gunakan kombinasi yang unik dan tidak digunakan pada layanan lain."><div className="auth-card-inner"><Suspense fallback={<p>Memuat formulir...</p>}><ResetPasswordContent /></Suspense></div></AuthShell>;
}
