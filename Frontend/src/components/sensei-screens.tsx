"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { LuArrowLeft, LuInfo, LuPlay, LuSearch } from "react-icons/lu";
import { useLearningRequest } from "@/components/learning-hooks";
import { formatStudentScheduleDate } from "@/lib/class-store";
import { replayLevels } from "@/lib/sensei-mock";
import { safeSystemUrl, studentReplays, studentSchedules, systemData, systemId, type ClassSchedule, type ReplayPlaylist } from "@/lib/schedule-replay-api";

function RequestState({ loading, error, retry }: { loading: boolean; error?: string; retry: () => void }) {
  return <section className="sensei-status-panel" aria-busy={loading}><p role={error ? "alert" : "status"}>{error || "Memuat…"}</p>{error && <button type="button" className="button button-primary" onClick={retry}>Coba Lagi</button>}</section>;
}

export function ScheduleScreen() {
  const request = useLearningRequest(studentSchedules, "schedules");
  const [view, setView] = useState("calendar");
  const [month, setMonth] = useState("");
  if (!request.data) return <RequestState {...request} />;
  const activeMonth = month || new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date());
  const sessions = request.data.filter(item => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date(item.scheduled_at)) === activeMonth);
  return <><div className="sensei-title-row"><PageHead eyebrow="BELAJAR DENGAN SENSEI • JADWAL KELAS" title="Jadwal cohort dan sesi bersama Sensei" description="Tanggal, jam, durasi, Sensei, cohort, dan link kelas mengikuti konfigurasi jadwal." /><Link href="/replay">Lihat Replay</Link></div><div className="sensei-controls"><label>Periode<input type="month" value={activeMonth} onChange={event => setMonth(event.target.value)} /></label><button type="button" className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>Kalender</button><button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")}>Daftar</button></div>{sessions.length ? <section className={view === "calendar" ? "schedule-layout" : ""}>{view === "calendar" && <div className="calendar-card"><div className="calendar-grid">{sessions.map(item => <Link className="event" href={`/schedule/chapter-4?id=${item.id}`} key={item.id}><time dateTime={item.scheduled_at}>{formatStudentScheduleDate(item.scheduled_at)}</time><strong>{item.title}</strong></Link>)}</div></div>}<aside className="upcoming-panel"><p className="dash-kicker">Sesi mendatang</p>{sessions.map(item => <Link className="schedule-session" href={`/schedule/chapter-4?id=${item.id}`} key={item.id}><div><strong>{item.title}</strong><small>{formatStudentScheduleDate(item.scheduled_at)}{item.sensei_name && ` • ${item.sensei_name}`}</small></div><span>Terjadwal</span></Link>)}</aside></section> : <section className="sensei-status-panel"><h2>Belum ada sesi pada periode ini</h2><p>Jadwal akan muncul setelah cohort dan sesi dipublikasikan tim akademik.</p></section>}<section className="sensei-announcement"><strong>Pengumuman</strong><p>Link Zoom aktif sesuai waktu dan jadwal yang ditentukan.</p></section><Link className="sensei-back" href="/dashboard">Kembali Dashboard</Link></>;
}

export function ClassDetailScreen({ scheduleId }: { scheduleId?: string } = {}) {
  const search = useSearchParams();
  const id = scheduleId || search.get("id") || "";
  const load = useCallback(async (signal: AbortSignal) => systemData<ClassSchedule>(`/api/student/class-schedules/${systemId(id)}`, signal), [id]);
  const request = useLearningRequest(load, `schedule:${id}`);
  if (!request.data) return <RequestState {...request} />;
  const item = request.data;
  return <><Link className="sensei-back" href="/schedule"><LuArrowLeft aria-hidden="true" /> Kembali Jadwal</Link><PageHead eyebrow="DETAIL KELAS • BIMBINGAN SENSEI" title={item.title} description={item.description || ""} /><section className="class-session-card"><div><span>{item.chapter || item.session}</span><b>Terjadwal</b></div><p className="dash-kicker">Zoom</p><h2>{item.sensei_name}</h2><p>{formatStudentScheduleDate(item.scheduled_at)}{item.duration_minutes && ` • ${item.duration_minutes} Menit`}</p>{safeSystemUrl(item.meeting_url) ? <a className="button button-dark" href={item.meeting_url!} target="_blank" rel="noopener noreferrer">Link Aktif Saat Sesi</a> : <button className="button button-dark" disabled>Link Zoom belum aktif</button>}</section><section className="sensei-announcement"><strong>Pengumuman</strong><p>Jadwal dan rekaman replay diperbarui secara berkala setelah sesi selesai.</p></section><Link className="button button-secondary" href="/replay">Lihat Replay</Link></>;
}

export function ReplayScreen(props: { purchasedLevel?: string } = {}) {
  void props;
  const request = useLearningRequest(studentReplays, "replays");
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  if (!request.data) return <RequestState {...request} />;
  const { access, playlists, programs } = request.data;
  const selected = filter || access.replay_levels.at(-1) || "";
  const visible = playlists.filter(item => programs.find(program => program.id === item.program_id)?.code === selected && item.title.toLowerCase().includes(search.toLowerCase()));
  const featured = visible[0];
  return <div className="replay-page-container"><div className="sensei-title-row replay-head-row"><PageHead eyebrow="BELAJAR DENGAN SENSEI • REPLAY KELAS" title="Rekaman Sesi Kelas Bersama Sensei" description="Tonton kembali penjelasan materi, pembahasan latihan, dan sesi tanya jawab interaktif." /><Link href="/schedule" className="button button-secondary replay-schedule-btn">Lihat Jadwal Kelas</Link></div><div className="replay-filter-bar"><label className="replay-search-input"><span aria-hidden="true"><LuSearch /></span><input aria-label="Cari rekaman" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari judul rekaman, chapter, atau topik..." /></label><div className="replay-tabs-group">{replayLevels.map(level => { const allowed = access.replay_levels.includes(level.toLowerCase()); return <button className={`replay-tab-btn ${selected === level.toLowerCase() ? "active" : ""}`} type="button" disabled={!allowed} onClick={() => setFilter(level.toLowerCase())} key={level}>{level}{allowed ? "" : " • Terkunci"}</button>; })}</div></div>{featured && <section className="replay-featured-card"><div className="replay-featured-preview"><span className="replay-play-icon" aria-hidden="true"><LuPlay /></span></div><div className="replay-featured-info"><div className="replay-featured-badges"><span className="replay-badge-status">Rekaman Terbaru</span></div><h2>{featured.title}</h2><p>{featured.description}</p><Link className="button button-primary" href={`/replay/chapter-4?id=${featured.id}`}>Putar Rekaman</Link></div></section>}<div className="replay-section-header"><h2>Daftar Rekaman Sesi</h2><span>{visible.length} rekaman tersedia</span></div>{visible.length ? <section className="replay-cards-grid">{visible.map(item => <article className="replay-session-card" key={item.id}><div className="replay-card-thumb"><LuPlay aria-hidden="true" /></div><div className="replay-card-body"><span className="replay-category-tag">{selected.toUpperCase()}</span><h3>{item.title}</h3><p>{item.description}</p><div className="replay-card-footer"><Link href={`/replay/chapter-4?id=${item.id}`} className="button button-primary">Buka Replay</Link></div></div></article>)}</section> : <section className="library-empty"><h2>Tidak ada rekaman ditemukan</h2><p>Ubah kata kunci pencarian atau filter untuk menemukan rekaman lain.</p></section>}<aside className="sensei-announcement replay-announcement-centered"><div className="replay-announcement-header"><LuInfo aria-hidden="true" /><strong>Pengumuman</strong></div><p>Replay tampil setelah rekaman sesi selesai diverifikasi dan dipublikasikan.</p></aside></div>;
}

export function ReplayPlayerScreen({ playlistId }: { playlistId?: string; youtubeVideoId?: string; purchasedLevel?: string } = {}) {
  const search = useSearchParams();
  const id = playlistId || search.get("id") || "";
  const load = useCallback(async (signal: AbortSignal) => systemData<ReplayPlaylist>(`/api/student/replay-playlists/${systemId(id)}`, signal), [id]);
  const request = useLearningRequest(load, `replay:${id}`);
  const [videoId, setVideoId] = useState<number>();
  if (!request.data) return <RequestState {...request} />;
  const item = request.data;
  const video = item.videos?.find(value => value.id === videoId) || item.videos?.[0];
  return <><Link className="sensei-back" href="/replay"><LuArrowLeft aria-hidden="true" /> Kembali ke Replay</Link><PageHead eyebrow="REPLAY" title={video?.title || item.title} description={video?.description || item.description || ""} /><section className="replay-player-container">{video && safeSystemUrl(video.video_url) ? <ReplayMedia url={video.video_url} title={video.title} /> : <section className="library-empty"><h2>Replay sedang diproses</h2><p>Rekaman, transkrip, dan materi sedang disiapkan sebelum dipublikasikan.</p></section>}</section><section className="replay-markers"><h2>Daftar Rekaman Sesi</h2>{item.videos?.map(value => <button className={video?.id === value.id ? "active" : ""} type="button" key={value.id} onClick={() => setVideoId(value.id)}><strong>{value.title}</strong><span>{value.chapter || value.session}</span></button>)}</section><section className="sensei-announcement"><strong>Status publikasi</strong><p>Replay tampil setelah rekaman sesi selesai diverifikasi dan dipublikasikan.</p></section></>;
}

function ReplayMedia({ url, title }: { url: string; title: string }) {
  const parsed = new URL(url);
  const youtube = ["www.youtube.com", "youtube.com", "m.youtube.com"].includes(parsed.hostname) ? parsed.searchParams.get("v") || parsed.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})$/)?.[1] : parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : null;
  if (youtube && /^[A-Za-z0-9_-]{11}$/.test(youtube)) return <iframe title={title} src={`https://www.youtube-nocookie.com/embed/${youtube}`} allow="encrypted-media; picture-in-picture" allowFullScreen style={{ width: "100%", aspectRatio: "16 / 9", border: 0 }} />;
  if (/\.(?:mp4|webm|ogg)$/i.test(parsed.pathname)) return <video src={url} controls preload="metadata" aria-label={title} style={{ width: "100%" }} />;
  return <a className="button button-primary" href={url} target="_blank" rel="noopener noreferrer">Tonton Replay</a>;
}

function PageHead({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <header className="sensei-page-head"><p className="dash-kicker">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header>; }
