"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LuBell } from "react-icons/lu";
import { useAuth } from "@/components/auth-provider";
import { StudentAvatar } from "@/components/student-avatar";
import { useProfileAvatar, useStudentNotifications } from "@/components/student-account-hooks";
import { safeNotificationPath, systemWrite } from "@/lib/schedule-replay-api";
import type { Membership } from "@/lib/dashboard-mock";
import styles from "./student-header-actions.module.css";

export function StudentHeaderActions({ membership }: { membership: Membership }) {
  const { user } = useAuth();
  const pathname = usePathname();
  return <HeaderActions key={`${user?.id}/${pathname}`} membership={membership} />;
}

function HeaderActions({ membership }: { membership: Membership }) {
  const onProfile = usePathname() === "/profile";
  const { user } = useAuth();
  const [open, setOpen] = useState<"profile" | "notifications" | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const bellTrigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const avatar = useProfileAvatar();
  const notifications = useStudentNotifications();
  const [readBusy, setReadBusy] = useState(false);
  const readPending = useRef(false);
  const [error, setError] = useState("");
  const label = membership === "sensei" ? "Kelas bersama Sensei" : membership === "lms" ? "Belajar Mandiri" : "Free Member";
  const unread = notifications.data?.filter(item => !item.read).length ?? 0;

  useEffect(() => {
    if (!open) return;
    const panel = root.current?.querySelector<HTMLElement>(`#student-${open}-dropdown`);
    panel?.querySelector<HTMLElement>("a,button")?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(null);
        (open === "profile" ? profileTrigger : bellTrigger).current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  async function mark(id: number) {
    if (readPending.current) return;
    readPending.current = true;
    setReadBusy(true);
    setError("");
    try {
      await systemWrite(`/api/student/notifications/${id}/read`, "PATCH", { read: true });
      window.dispatchEvent(new Event("hiru:notifications-changed"));
    } catch {
      setError("Permintaan belum berhasil. Silakan coba lagi.");
    } finally {
      readPending.current = false;
      setReadBusy(false);
    }
  }

  return <div ref={root} className={styles.actions} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(null);
  }}>
    <button ref={bellTrigger} className={styles.bell} type="button" aria-label="Notifikasi" aria-expanded={open === "notifications"} aria-controls="student-notifications-dropdown" onClick={() => {
      if (open !== "notifications") notifications.retry();
      setOpen(open === "notifications" ? null : "notifications");
    }}><LuBell aria-hidden="true" />{unread > 0 && <span className={styles.badge} aria-label={`${unread} notifikasi belum dibaca`}>{unread > 99 ? "99+" : unread}</span>}</button>
    <button ref={profileTrigger} type="button" className={styles.account} aria-label="Profil akun" aria-expanded={open === "profile"} aria-controls="student-profile-dropdown" onClick={() => setOpen(open === "profile" ? null : "profile")}>
      <StudentAvatar name={user?.name ?? ""} url={user?.avatar_resolved_url} className="dash-avatar" />
      <span className={styles.identity}><strong>{user?.name}</strong><span>{label}</span></span>
    </button>
    {open === "profile" && <section id="student-profile-dropdown" aria-label="Profil akun" className={styles.dropdown}>
      <strong>{user?.name}</strong><p>{label}</p>
      <Link href="/profile" onClick={() => setOpen(null)}>Lihat Profil</Link>
      {onProfile ? <Link href="#pengaturan" onClick={() => setOpen(null)}>Kelola Foto Profil</Link> : <button type="button" disabled={!!avatar.busy} onClick={() => input.current?.click()}>{avatar.busy ? "Mengunggah..." : "Ganti Foto Profil"}</button>}
      {avatar.error && <p role="alert">{avatar.error}</p>}
      {avatar.success && <p role="status">Foto profil berhasil diperbarui.</p>}
    </section>}
    <input ref={input} className={styles.file} type="file" aria-label="Ganti Foto Profil" accept="image/jpeg,image/png,image/webp" disabled={!!avatar.busy} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void avatar.update(file);
    }} />
    {open === "notifications" && <section id="student-notifications-dropdown" aria-label="Notifikasi terbaru" className={styles.dropdown}>
      <strong>Notifikasi</strong>
      {(error || notifications.error) && <p role="alert">{error || notifications.error}</p>}
      {notifications.error && <button type="button" onClick={notifications.retry}>Coba Lagi</button>}
      {!notifications.data && !notifications.error && <p role="status">Memuat…</p>}
      {notifications.data?.slice(0, 5).map(item => <article key={item.id} className={!item.read ? styles.unread : undefined}>
        <strong>{item.title}</strong><p>{item.body}</p>
        {item.cta_label && safeNotificationPath(item.path) && <Link href={item.path!} onClick={() => { if (!item.read) void mark(item.id); setOpen(null); }}>{item.cta_label}</Link>}
        {!item.read && <button type="button" disabled={readBusy} onClick={() => void mark(item.id)}>Tandai dibaca</button>}
      </article>)}
      {notifications.data?.length === 0 && <p>Belum ada notifikasi</p>}
      <Link href="/notifikasi" onClick={() => setOpen(null)}>Lihat Semua Notifikasi</Link>
    </section>}
  </div>;
}
