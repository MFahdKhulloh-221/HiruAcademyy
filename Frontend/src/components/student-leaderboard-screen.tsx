"use client";

import { useCallback, useId, useRef, useState } from "react";
import { LuInfo } from "react-icons/lu";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { StudentAvatar } from "@/components/student-avatar";
import { useLearningRequest } from "@/components/learning-hooks";
import { studentLeaderboard, type LeaderboardScope, type StudentLeaderboardEntry } from "@/lib/learning-api";

const categories = { free: "Free Member", lms: "LMS Mandiri", sensei: "Sensei" };
const scopes: { value: LeaderboardScope; label: string }[] = [
  { value: "all", label: "Semua Siswa" }, { value: "lms", label: "LMS Mandiri" }, { value: "sensei", label: "Sensei" },
];
const rules = [
  "Ranking dihitung berdasarkan XP dari aktivitas belajar yang diselesaikan.",
  "Leaderboard diperbarui berdasarkan aktivitas siswa.",
  "Periode kompetisi Senin–Minggu dan dimulai ulang setiap Senin pukul 00.00 WIB.",
  "Maksimal 50 XP dapat diperoleh setiap hari.",
  "Mengulang aktivitas yang sama tidak memberikan XP tanpa batas.",
  "Filter Semua Siswa, LMS Mandiri, dan Sensei menggunakan aturan XP yang sama.",
  "Streak dihitung dari aktivitas belajar harian dan tidak ikut direset setiap minggu.",
  "Siswa baru memiliki Tantangan 7 Hari Pertama.",
];

export function LeaderboardRules() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  return <>
    <button ref={trigger} type="button" className="leaderboard-info" aria-label="Aturan Leaderboard HiruAcademy" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><LuInfo aria-hidden="true" /></button>
    <dialog ref={dialog} className="mini-locked-dialog leaderboard-rules" aria-labelledby={titleId} onClose={() => trigger.current?.focus()}>
      <form method="dialog"><button type="submit" className="button button-secondary" aria-label="Tutup" autoFocus>×</button></form>
      <h2 id={titleId}>Aturan Leaderboard HiruAcademy</h2>
      <ol>{rules.map(rule => <li key={rule}>{rule}</li>)}</ol>
    </dialog>
  </>;
}

export function LeaderboardRows({ entries }: { entries: StudentLeaderboardEntry[] }) {
  return <ol className="dash-leaderboard-list leaderboard-rows">{entries.map(row => <li key={row.user_id} value={row.rank} className={`dash-leaderboard-item${row.is_current_user ? " current-user" : ""}`}>
    <span className={`dash-rank-badge rank-${row.rank}`}>{row.rank}</span>
    <StudentAvatar name={row.name} url={row.avatar_url} className="leaderboard-avatar" />
    <div className="dash-leaderboard-info"><strong>{row.name}{row.is_current_user && " (Kamu)"}</strong><small>{categories[row.category]} · {row.weekly_xp.toLocaleString("id-ID")} XP · {row.streak_days} Hari Streak</small></div>
  </li>)}</ol>;
}

export function StudentLeaderboardScreen() {
  const [scope, setScope] = useState<LeaderboardScope>("all");
  const load = useCallback((signal: AbortSignal) => studentLeaderboard(scope, signal), [scope]);
  const request = useLearningRequest(load, `leaderboard-${scope}`);
  const top = request.data?.entries.filter(row => row.rank <= 20) ?? [];
  const self = request.data?.self;
  const outside = self && !top.some(row => row.user_id === self.user_id) ? self : null;
  return <>
    <header className="supporting-header"><p className="dash-kicker">LEADERBOARD</p><div className="leaderboard-title"><h1>Bandingkan konsistensi, bukan tekanan</h1><LeaderboardRules /></div><p>Poin, periode, level, rank, dan peringkat diperbarui secara berkala.</p></header>
    <div className="leaderboard-scopes" role="group" aria-label="Filter Leaderboard">{scopes.map(item => <button key={item.value} type="button" aria-pressed={scope === item.value} onClick={() => setScope(item.value)}>{item.label}</button>)}</div>
    <section className="dash-leaderboard-section" aria-busy={request.loading}>
      {!request.data && !request.error && <LoadingSkeleton variant="ranking" rows={5} label="Memuat leaderboard…" />}
      {request.error && <p role="alert">{request.error} <button type="button" className="button button-secondary" onClick={request.retry}>Coba Lagi</button></p>}
      {request.data && <>{top.length === 0 && <p role="status">Belum ada data untuk ditampilkan.</p>}<LeaderboardRows entries={top} />{outside && <div className="leaderboard-self"><LeaderboardRows entries={[outside]} /></div>}</>}
    </section>
  </>;
}
