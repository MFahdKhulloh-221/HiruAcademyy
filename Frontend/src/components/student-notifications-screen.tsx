"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LuArrowUpRight, LuBell, LuCheckCheck } from "react-icons/lu";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useStudentNotifications } from "@/components/student-account-hooks";
import { notificationCategory, notificationDay, notificationTime } from "@/lib/notification-presentation";
import { safeNotificationPath, systemWrite } from "@/lib/schedule-replay-api";
import type { SystemNotification } from "@/lib/schedule-replay-api";
import styles from "./student-notifications-screen.module.css";

const filters = ["Semua", "Belum dibaca", "Sudah dibaca"] as const;

export function StudentNotificationsScreen() {
  const request = useStudentNotifications();
  const router = useRouter();
  const [filter, setFilter] = useState<typeof filters[number]>("Semua");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const unread = request.data?.filter(item => !item.read).length ?? 0;
  const now = new Date();
  const items = request.data?.filter(item => filter === "Semua" || item.read === (filter === "Sudah dibaca")) ?? [];
  const groups = new Map<string, { label: string; items: SystemNotification[] }>();
  for (const item of [...items].sort((a, b) => (Date.parse(b.time ?? "") || 0) - (Date.parse(a.time ?? "") || 0))) {
    const day = notificationDay(item.time, now);
    if (!groups.has(day.key)) groups.set(day.key, { label: day.label, items: [] });
    groups.get(day.key)!.items.push(item);
  }

  async function mark(id?: number, read = true) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await systemWrite(id !== undefined ? `/api/student/notifications/${id}/read` : "/api/student/notifications/read-all", id !== undefined ? "PATCH" : "POST", id !== undefined ? { read } : undefined);
      window.dispatchEvent(new Event("hiru:notifications-changed"));
      return true;
    } catch {
      setError("Status notifikasi belum berhasil diperbarui. Silakan coba lagi.");
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function openNotification(item: SystemNotification) {
    if (pending.current || !safeNotificationPath(item.path)) return;
    if (!item.read && !await mark(item.id)) return;
    router.push(item.path!);
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.kicker}>PUSAT NOTIFIKASI</p><h1>Notifikasi</h1><p>Informasi terbaru seputar perjalanan belajarmu.</p></div>
      <button className={styles.markAll} type="button" disabled={busy || unread === 0} onClick={() => void mark()}><LuCheckCheck aria-hidden="true" />Tandai semua dibaca</button>
    </header>
    <div className={styles.toolbar}>
      <div className={styles.filters} role="group" aria-label="Filter notifikasi">{filters.map(value => <button type="button" className={filter === value ? styles.active : undefined} aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{value}{value === "Belum dibaca" && unread > 0 && <span>{unread}</span>}</button>)}</div>
      {request.data && <p className={styles.count} role="status">{unread > 0 ? `${unread} notifikasi belum dibaca` : "Semua notifikasi sudah dibaca"}</p>}
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {request.error && <div className={styles.error} role="alert"><p>Notifikasi belum berhasil dimuat. Silakan coba lagi.</p><button type="button" onClick={request.retry}>Coba lagi</button></div>}
    {!request.data && !request.error && <LoadingSkeleton variant="list" label="Memuat notifikasi…" />}
    {[...groups].map(([key, group]) => <section className={styles.group} key={key} aria-label={group.label}>
      <h2 className={styles.groupTitle}>{group.label}</h2>
      <div className={styles.list}>{group.items.map(item => {
        const { label, Icon, tone } = notificationCategory(item.type);
        const time = notificationTime(item.time, now);
        const hasDestination = safeNotificationPath(item.path);
        return <article className={`${styles.card} ${!item.read ? styles.unread : ""}`} key={item.id}>
          <span className={styles.icon} data-category={tone} aria-hidden="true"><Icon /></span>
          <div className={styles.content}>
            <div className={styles.meta}><span className={styles.category}>{label}</span>{time && <time dateTime={item.time!}>{time}</time>}{!item.read && <span className={styles.dot} role="img" aria-label="Belum dibaca" />}</div>
            <h3>{hasDestination ? <button className={styles.titleLink} type="button" disabled={busy} onClick={() => void openNotification(item)}>{item.title}</button> : item.title}</h3>
            <p className={styles.body}>{item.body}</p>
            <div className={styles.cardActions}>{hasDestination && <button className={styles.destination} type="button" disabled={busy} onClick={() => void openNotification(item)}>{item.cta_label || "Lihat selengkapnya"}<LuArrowUpRight aria-hidden="true" /></button>}<button className={styles.readAction} type="button" disabled={busy} onClick={() => void mark(item.id, !item.read)}>{item.read ? "Tandai belum dibaca" : "Tandai dibaca"}</button></div>
          </div>
        </article>;
      })}</div>
    </section>)}
    {request.data && !request.error && items.length === 0 && <section className={styles.empty}><span className={styles.emptyIcon}><LuBell aria-hidden="true" /></span><h2>{request.data.length === 0 ? "Belum ada notifikasi" : filter === "Belum dibaca" ? "Tidak ada notifikasi belum dibaca" : "Belum ada notifikasi yang sudah dibaca"}</h2><p>{request.data.length === 0 ? "Informasi terbaru dari HiruAcademy akan muncul di sini." : filter === "Belum dibaca" ? "Semua kabar terbaru sudah kamu baca." : "Notifikasi yang sudah kamu baca akan muncul di sini."}</p>{request.data.length > 0 && <button type="button" onClick={() => setFilter("Semua")}>Lihat semua notifikasi</button>}</section>}
  </div>;
}
