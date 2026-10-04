"use client";

import Link from "next/link";
import { useState } from "react";
import { LuBell } from "react-icons/lu";
import { useLearningRequest } from "@/components/learning-hooks";
import { safeNotificationPath, studentNotifications, systemWrite } from "@/lib/schedule-replay-api";

export function StudentNotificationsScreen() {
  const request = useLearningRequest(studentNotifications, "notifications");
  const [filter, setFilter] = useState("Semua");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function mark(id?: number, read = true) {
    if (busy) return;
    setBusy(true); setError("");
    try { await systemWrite(id ? `/api/student/notifications/${id}/read` : "/api/student/notifications/read-all", id ? "PATCH" : "POST", id ? { read } : undefined); request.retry(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi."); }
    finally { setBusy(false); }
  }
  return <div className="notification-page"><header className="supporting-header"><p className="dash-kicker">NOTIFICATION CENTER</p><h1>Notifikasi</h1></header><div className="sensei-controls">{["Semua", "Belum dibaca", "Sudah dibaca"].map(value => <button type="button" className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{value}</button>)}<button type="button" disabled={busy || !request.data?.some(item => !item.read)} onClick={() => void mark()}>Tandai semua dibaca</button></div>{(error || request.error) && <p role="alert">{error || request.error}</p>}{request.error && <button className="button" onClick={request.retry}>Coba Lagi</button>}{request.loading && <p role="status">Memuat…</p>}<section className="notification-group">{request.data?.filter(item => filter === "Semua" || item.read === (filter === "Sudah dibaca")).map(item => <article className={item.read ? "" : "unread"} key={item.id}><span className="notification-icon" aria-hidden="true"><LuBell /></span><div><small>{item.type}</small><h2>{item.title}</h2><p>{item.body}</p>{item.cta_label && safeNotificationPath(item.path) && <Link href={item.path!}>{item.cta_label}</Link>}</div><button className="button" type="button" disabled={busy} onClick={() => void mark(item.id, !item.read)}>{item.read ? "Tandai belum dibaca" : "Tandai dibaca"}</button></article>)}</section>{request.data?.length === 0 && <section className="library-empty"><h2>Belum ada notifikasi</h2></section>}</div>;
}
