"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ProfileIdentity } from "@/components/profile-identity";
import { useProfileAvatar } from "@/components/student-account-hooks";
import { useAuth } from "@/components/auth-provider";
import { ApiError, apiRequest } from "@/lib/api";
import type { LearningAccess, LearningProgram } from "@/lib/learning-api";
import { commercialCode } from "@/lib/commercial-api";
import styles from "./profile-screen.module.css";

export function ProfileScreen({ access, programs }: { access: LearningAccess; programs: LearningProgram[] }) {
  const { user, refreshUser } = useAuth();
  const photoInput = useRef<HTMLInputElement>(null);
  const { busy: avatarBusy, success: avatarSuccess, error: avatarError, update: updateAvatar } = useProfileAvatar();
  const hasAvatar = !!(user?.avatar || user?.avatar_resolved_url);

  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void updateAvatar(file);
  }

  const [tab, setTab] = useState("Data Akun");
  const [name, setName] = useState(user?.name ?? "");
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? "");
  const [country, setCountry] = useState(user?.country ?? "");
  const [targetJlpt, setTargetJlpt] = useState(user?.target_jlpt ?? "N5");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState("");

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (profileBusy) return;
    setProfileBusy(true);
    setProfileError("");
    setProfileSuccess(false);
    try {
      await apiRequest("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          email: user?.email,
          whatsapp: whatsapp.trim(),
          country: country.trim() || null,
          target_jlpt: targetJlpt,
        }),
      });
      if (!await refreshUser({ background: true })) throw new ApiError(401);
      setProfileSuccess(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Gagal memperbarui profil. Silakan coba lagi.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwBusy) return;
    setPwSuccess(false);
    if (newPassword !== confirmPassword) {
      setPwError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setPwBusy(true);
    setPwError("");
    setPwSuccess(false);
    try {
      await apiRequest("/api/me/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: currentPassword,
          password: newPassword,
          password_confirmation: confirmPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwSuccess(true);
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : "Gagal memperbarui kata sandi. Silakan coba lagi.");
    } finally {
      setPwBusy(false);
    }
  }

  const tabs = ["Data Akun", "Keamanan"];
  const nameInput = useRef<HTMLInputElement>(null);
  const [nameEditRequest, setNameEditRequest] = useState(0);
  useEffect(() => {
    if (!nameEditRequest) return;
    nameInput.current?.focus({ preventScroll: true });
    document.getElementById("pengaturan")?.scrollIntoView({ block: "start" });
  }, [nameEditRequest]);
  function openPersonal() { setTab("Data Akun"); setNameEditRequest(value => value + 1); }
  return <div className={styles.page}>
    <header className={styles.header}><h1>Profil</h1><p>Informasi akun, program belajar, dan pengaturan.</p></header>
    <nav className={styles.quickLinks} aria-label="Akses Cepat"><Link href="/certificate">Sertifikat <span aria-hidden="true">&rarr;</span></Link><Link href="/affiliate">Program Affiliate <span aria-hidden="true">&rarr;</span></Link></nav>
    <div className={styles.identity} id="foto-profil">
      <ProfileIdentity><div className={styles.actions}>
        <button type="button" className="button button-primary" disabled={!!avatarBusy} onClick={() => photoInput.current?.click()}>{avatarBusy === "upload" ? "Mengunggah..." : "Ganti Foto"}</button>
        <button type="button" className="button button-secondary" onClick={openPersonal}>Ubah Nama</button>
        {hasAvatar && <button type="button" className="button button-secondary" disabled={!!avatarBusy} onClick={() => void updateAvatar()}>Hapus Foto</button>}
      </div></ProfileIdentity>
      <input ref={photoInput} id="profile-photo" hidden aria-label="File foto profil" type="file" accept="image/jpeg,image/png,image/webp" disabled={!!avatarBusy} onChange={selectAvatar} />
      {avatarSuccess && <p role="status" className="profile-settings-success">Foto profil berhasil diperbarui.</p>}
      {avatarError && <p role="alert" className="profile-settings-error">{avatarError}</p>}
    </div>
    <section className={styles.card} aria-labelledby="membership-title"><div className={styles.sectionHead}><h2 id="membership-title">Keanggotaan</h2><Link className="button button-secondary" href="/renewal">Perpanjang Membership</Link></div>
      {access.source_grants.length ? <ul className={styles.memberships}>{access.source_grants.map((grant, index) => <li key={`${grant.program_code}/${grant.plan_code}/${index}`}><span>{programs.find(program => program.code === grant.program_code)?.name ?? commercialCode(grant.program_code)} &middot; {grant.plan_code === "sensei" ? "Kelas bersama Sensei" : grant.plan_code === "lms" ? "Belajar Mandiri" : grant.plan_code}</span>{grant.ends_at && <small>Berlaku hingga {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(grant.ends_at))}</small>}</li>)}</ul> : <p>Belum ada keanggotaan program.</p>}
    </section>
    <section className={styles.card} id="pengaturan" aria-labelledby="settings-title"><div className={styles.sectionHead}><h2 id="settings-title">Pengaturan Akun</h2></div>
      <div id="profile-settings-content">
        <div role="tablist" aria-label="Pengaturan Akun" className={styles.tabs}>{tabs.map(label => <button key={label} id={`profile-tab-${tabs.indexOf(label)}`} type="button" role="tab" aria-selected={tab === label} aria-controls="profile-settings-panel" tabIndex={tab === label ? 0 : -1} onClick={() => { setTab(label); setProfileSuccess(false); setProfileError(""); }} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (tabs.indexOf(label) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          setTab(tabs[next]); document.getElementById(`profile-tab-${next}`)?.focus();
        }}>{label}</button>)}</div>
        <div role="tabpanel" id="profile-settings-panel" aria-labelledby={`profile-tab-${tabs.indexOf(tab)}`} className={styles.panel}>
          {tab !== "Keamanan" ? <form onSubmit={handleUpdateProfile} className={styles.form}><fieldset disabled={profileBusy}>
            <><label>Nama Lengkap<input ref={nameInput} required maxLength={255} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label><label>Email<input aria-label="Email" type="email" autoComplete="email" value={user?.email ?? ""} readOnly /><small>Email akun tidak dapat diubah melalui halaman ini.</small></label><label>Nomor WhatsApp<input required maxLength={32} type="tel" autoComplete="tel" value={whatsapp} onChange={event => setWhatsapp(event.target.value)} /></label><label>Negara<input maxLength={100} autoComplete="country-name" value={country} onChange={event => setCountry(event.target.value)} /></label><label>Target JLPT<select value={targetJlpt} onChange={event => setTargetJlpt(event.target.value)}>{["N5", "N4", "N3", "N2", "N1"].map(level => <option key={level} value={level}>JLPT {level}</option>)}</select></label></>
          </fieldset>{profileSuccess && <p role="status">Profil berhasil diperbarui.</p>}{profileError && <p role="alert">{profileError}</p>}<button type="submit" disabled={profileBusy} className="button button-primary">{profileBusy ? "Menyimpan..." : "Simpan Perubahan"}</button></form> : <form onSubmit={handleUpdatePassword} className={styles.form}><fieldset disabled={pwBusy}><label>Kata Sandi Saat Ini<input required type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><label>Kata Sandi Baru<input aria-label="Kata Sandi Baru" required minLength={8} type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /><small>Minimal 8 karakter.</small></label><label>Konfirmasi Kata Sandi Baru<input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label></fieldset>{pwSuccess && <p role="status">Kata sandi berhasil diperbarui.</p>}{pwError && <p role="alert">{pwError}</p>}<button type="submit" className="button button-primary" disabled={pwBusy}>{pwBusy ? "Memproses..." : "Perbarui Kata Sandi"}</button></form>}
        </div>
      </div>
    </section>
  </div>;
}
