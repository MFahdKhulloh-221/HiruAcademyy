"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { LuArrowLeft, LuPlay, LuSearch } from "react-icons/lu";
import { useLearningRequest } from "@/components/learning-hooks";
import { replayLevels } from "@/lib/sensei-mock";
import { safeSystemUrl, studentReplays, studentSchedules, systemData, systemId, type ClassSchedule, type ReplayPlaylist } from "@/lib/schedule-replay-api";

const jakartaDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
const scheduleDate = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const scheduleTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function RequestState({ loading, error, retry }: { loading: boolean; error?: string; retry: () => void }) {
  return <section className="sensei-status-panel" aria-busy={loading}><p role={error ? "alert" : "status"}>{error || "Memuat…"}</p>{error && <button type="button" className="button button-primary" onClick={retry}>Coba Lagi</button>}</section>;
}

function sessionTime(item: ClassSchedule) {
  const start = new Date(item.scheduled_at);
  const end = item.duration_minutes ? new Date(start.getTime() + item.duration_minutes * 60_000) : null;
  return `${scheduleTime.format(start)}${end ? ` – ${scheduleTime.format(end)}` : ""} WIB`;
}

function sessionStatus(item: ClassSchedule) {
  const start = new Date(item.scheduled_at).getTime();
  if (item.status === "cancelled") return "Dibatalkan";
  if (Date.now() < start) return "Terjadwal";
  if (!item.duration_minutes) return item.status === "published" ? "Dipublikasikan" : item.status;
  return Date.now() < start + item.duration_minutes * 60_000 ? "Berlangsung" : "Selesai";
}

function contextLabel(label: string, value: string | null | undefined) {
  if (!value) return null;
  return new RegExp(`^${label}\\b`, "i").test(value) ? value : `${label} ${value}`;
}

function ScheduleMetadata({ item }: { item: ClassSchedule }) {
  return <dl className="batch3-metadata">
    <div><dt>Tanggal</dt><dd><time dateTime={item.scheduled_at}>{scheduleDate.format(new Date(item.scheduled_at))}</time></dd></div>
    <div><dt>Jam</dt><dd>{sessionTime(item)}</dd></div>
    <div><dt>Level</dt><dd>{item.program?.name || item.program?.code.toUpperCase() || "—"}</dd></div>
    <div><dt>Sensei</dt><dd>{item.sensei_name || "—"}</dd></div>
    <div><dt>Durasi</dt><dd>{item.duration_minutes ? `${item.duration_minutes} Menit` : "—"}</dd></div>
    {item.chapter && <div><dt>Chapter</dt><dd>{contextLabel("Chapter", item.chapter)}</dd></div>}
    {item.session && <div><dt>Sesi</dt><dd>{contextLabel("Sesi", item.session)}</dd></div>}
  </dl>;
}

export function ScheduleScreen() {
  const request = useLearningRequest(studentSchedules, "schedules");
  const [view, setView] = useState("calendar");
  const [month, setMonth] = useState("");
  if (!request.data) return <RequestState {...request} />;
  const activeMonth = month || jakartaDate.format(new Date()).slice(0, 7);
  const sessions = request.data.filter(item => jakartaDate.format(new Date(item.scheduled_at)).slice(0, 7) === activeMonth);
  const [year, monthNumber] = activeMonth.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const today = jakartaDate.format(new Date());
  return <div className="batch3-schedule">
    <div className="sensei-title-row"><PageHead eyebrow="BELAJAR DENGAN SENSEI • JADWAL KELAS" title="Jadwal cohort dan sesi bersama Sensei" description="Tanggal, jam, durasi, Sensei, cohort, dan link kelas mengikuti konfigurasi jadwal." /><Link href="/replay">Lihat Replay</Link></div>
    <div className="sensei-controls batch3-schedule-controls"><label>Periode<input type="month" value={activeMonth} onChange={event => setMonth(event.target.value)} /></label><button type="button" aria-pressed={view === "calendar"} className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>Kalender</button><button type="button" aria-pressed={view === "list"} className={view === "list" ? "active" : ""} onClick={() => setView("list")}>Daftar</button></div>
    {view === "calendar" && <section className="batch3-calendar-card" aria-label="Kalender kelas">
      <h2>{new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))}</h2>
      <div className="batch3-calendar-scroll" tabIndex={0} role="region" aria-label="Kalender kelas">
        <div className="batch3-calendar-grid">
          {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map(day => <div className="batch3-weekday" key={day}>{day}</div>)}
          {Array.from({ length: firstWeekday }, (_, index) => <div className="batch3-calendar-blank" aria-hidden="true" key={`blank-${index}`} />)}
          {Array.from({ length: days }, (_, index) => {
            const day = index + 1;
            const date = `${activeMonth}-${String(day).padStart(2, "0")}`;
            const events = sessions.filter(item => jakartaDate.format(new Date(item.scheduled_at)) === date);
            return <div className={`batch3-calendar-day${date === today ? " is-today" : ""}`} key={date}>
              <time dateTime={date} aria-current={date === today ? "date" : undefined}>{day}</time>
              {events.map(item => <Link className="batch3-calendar-event" href={`/schedule/chapter-4?id=${item.id}`} key={item.id}>
                <span>{sessionTime(item)}</span><strong>{item.title}</strong><small>{item.program?.code.toUpperCase()}{item.sensei_name && ` • ${item.sensei_name}`}</small>
              </Link>)}
            </div>;
          })}
        </div>
      </div>
    </section>}
    {sessions.length ? <section className="batch3-schedule-list" aria-label="Daftar sesi">
      {sessions.map(item => <article className="batch3-session" key={item.id}>
        <header><h2>{item.title}</h2><span className="batch3-status">{sessionStatus(item)}</span></header>
        <ScheduleMetadata item={item} />
        <Link className="button button-secondary" href={`/schedule/chapter-4?id=${item.id}`}>Lihat Detail<span className="batch3-sr-only">: {item.title}</span></Link>
      </article>)}
    </section> : <section className="sensei-status-panel"><h2>Belum ada sesi pada periode ini</h2><p>Jadwal akan muncul setelah cohort dan sesi dipublikasikan tim akademik.</p></section>}
    <section className="sensei-announcement"><strong>Pengumuman</strong><p>Link Zoom aktif sesuai waktu dan jadwal yang ditentukan.</p></section><Link className="sensei-back" href="/dashboard">Kembali Dashboard</Link>
  </div>;
}

export function ClassDetailScreen({ scheduleId }: { scheduleId?: string } = {}) {
  const search = useSearchParams();
  const id = scheduleId || search.get("id") || "";
  const load = useCallback(async (signal: AbortSignal) => systemData<ClassSchedule>(`/api/student/class-schedules/${systemId(id)}`, signal), [id]);
  const request = useLearningRequest(load, `schedule:${id}`);
  if (!request.data) return <RequestState {...request} />;
  const item = request.data;
  return <div className="batch3-schedule">
    <Link className="sensei-back" href="/schedule"><LuArrowLeft aria-hidden="true" /> Kembali Jadwal</Link><PageHead eyebrow="DETAIL KELAS • BIMBINGAN SENSEI" title={item.title} description={item.description || ""} />
    <section className="class-session-card batch3-class-detail"><header><p className="dash-kicker">Zoom</p><span className="batch3-status">{sessionStatus(item)}</span></header><ScheduleMetadata item={item} />
      {safeSystemUrl(item.meeting_url) ? <a className="button button-dark" href={item.meeting_url!} target="_blank" rel="noopener noreferrer">Link Aktif Saat Sesi</a> : <button className="button button-dark" disabled>Link Zoom belum aktif</button>}
    </section><section className="sensei-announcement"><strong>Pengumuman</strong><p>Jadwal dan rekaman replay diperbarui secara berkala setelah sesi selesai.</p></section><Link className="button button-secondary" href="/replay">Lihat Replay</Link>
  </div>;
}

function ReplayPreview({ item }: { item: ReplayPlaylist }) {
  return <div className="batch3-replay-preview" aria-hidden="true"><span className="replay-play-icon"><LuPlay /></span><span>{item.program?.name || item.program?.code.toUpperCase()}</span><strong>{item.title}</strong></div>;
}

export function ReplayScreen(props: { purchasedLevel?: string } = {}) {
  void props;
  const request = useLearningRequest(studentReplays, "replays");
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  if (!request.data) return <RequestState {...request} />;
  const { access, playlists, programs } = request.data;
  const selected = filter || access.replay_levels.at(-1) || "";
  const visible = playlists.filter(item => (item.program?.code || programs.find(program => program.id === item.program_id)?.code) === selected && item.title.toLowerCase().includes(search.toLowerCase()));
  const featured = visible[0];
  return <div className="replay-page-container batch3-replay">
    <div className="sensei-title-row replay-head-row"><PageHead eyebrow="BELAJAR DENGAN SENSEI • REPLAY KELAS" title="Rekaman Sesi Kelas Bersama Sensei" description="Tonton kembali penjelasan materi, pembahasan latihan, dan sesi tanya jawab interaktif." /><Link href="/schedule" className="button button-secondary replay-schedule-btn">Lihat Jadwal Kelas</Link></div>
    <div className="replay-filter-bar"><label className="replay-search-input"><span aria-hidden="true"><LuSearch /></span><input aria-label="Cari rekaman" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari judul rekaman, chapter, atau topik..." /></label><div className="replay-tabs-group">{replayLevels.map(level => { const allowed = access.replay_levels.includes(level.toLowerCase()); return <button className={`replay-tab-btn ${selected === level.toLowerCase() ? "active" : ""}`} aria-pressed={selected === level.toLowerCase()} type="button" disabled={!allowed} onClick={() => setFilter(level.toLowerCase())} key={level}>{level}{allowed ? "" : " • Terkunci"}</button>; })}</div></div>
    {featured && <section className="replay-featured-card"><ReplayPreview item={featured} /><div className="replay-featured-info"><div className="replay-featured-badges"><span className="replay-badge-status">Rekaman Terbaru</span><span className="replay-category-tag">{selected.toUpperCase()}</span></div><h2>{featured.title}</h2><p>{featured.description}</p><Link className="button button-primary" href={`/replay/chapter-4?id=${featured.id}`}>Tonton Replay<span className="batch3-sr-only">: {featured.title}</span></Link></div></section>}
    <div className="replay-section-header"><h2>Daftar Rekaman Sesi</h2><span>{visible.length} rekaman tersedia</span></div>
    {visible.length ? <section className="replay-cards-grid">{visible.map(item => <article className="replay-session-card" key={item.id}><ReplayPreview item={item} /><div className="replay-card-body"><span className="replay-category-tag">{selected.toUpperCase()}</span><h3>{item.title}</h3><p>{item.description}</p><Link className="button button-primary" href={`/replay/chapter-4?id=${item.id}`}>Tonton Replay<span className="batch3-sr-only">: {item.title}</span></Link></div></article>)}</section> : <section className="sensei-status-panel"><h2>Belum ada rekaman</h2><p>Replay tampil setelah sesi selesai diverifikasi dan dipublikasikan.</p></section>}
    <section className="sensei-announcement"><strong>Pengumuman</strong><p>Replay tampil setelah rekaman sesi selesai diverifikasi dan dipublikasikan.</p></section>
  </div>;
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
  const mediaUrl = [video?.video_url_resolved_url, video?.video_url].find(url => safeSystemUrl(url));
  return <div className="batch3-replay">
    <Link className="sensei-back" href="/replay"><LuArrowLeft aria-hidden="true" /> Kembali ke Replay</Link><PageHead eyebrow="REPLAY" title={item.title} description={item.description || ""} />
    <section className="batch3-replay-detail"><span className="replay-category-tag">{item.program?.name || item.program?.code.toUpperCase()}</span>{video && <><h2>{video.title}</h2>{video.description && <p>{video.description}</p>}<dl className="batch3-metadata"><div><dt>Sensei</dt><dd>{video.sensei_name || "—"}</dd></div>{video.recorded_at && <div><dt>Tanggal</dt><dd><time dateTime={video.recorded_at}>{scheduleDate.format(new Date(video.recorded_at))}</time></dd></div>}{video.chapter && <div><dt>Chapter</dt><dd>{contextLabel("Chapter", video.chapter)}</dd></div>}{video.session && <div><dt>Sesi</dt><dd>{contextLabel("Sesi", video.session)}</dd></div>}</dl></>}</section>
    <section className="replay-player-container batch3-replay-player">{video && mediaUrl ? <ReplayMedia url={mediaUrl} title={video.title} /> : <section className="batch3-media-empty"><LuPlay aria-hidden="true" /><h2>Replay sedang diproses</h2><p>Rekaman, transkrip, dan materi sedang disiapkan sebelum dipublikasikan.</p></section>}</section>
    <section className="replay-markers"><h2>Daftar Rekaman Sesi</h2>{item.videos?.map(value => <button className={video?.id === value.id ? "active" : ""} aria-pressed={video?.id === value.id} type="button" key={value.id} onClick={() => setVideoId(value.id)}><strong>{value.title}</strong><span>{[contextLabel("Chapter", value.chapter), contextLabel("Sesi", value.session), value.sensei_name].filter(Boolean).join(" • ")}</span></button>)}</section><section className="sensei-announcement"><strong>Status publikasi</strong><p>Replay tampil setelah rekaman sesi selesai diverifikasi dan dipublikasikan.</p></section>
  </div>;
}

function ReplayMedia({ url, title }: { url: string; title: string }) {
  const parsed = new URL(url);
  const youtube = ["www.youtube.com", "youtube.com", "m.youtube.com"].includes(parsed.hostname) ? parsed.searchParams.get("v") || parsed.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})$/)?.[1] : parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : null;
  if (youtube && /^[A-Za-z0-9_-]{11}$/.test(youtube)) return <iframe key={url} title={title} src={`https://www.youtube-nocookie.com/embed/${youtube}`} allow="encrypted-media; picture-in-picture" allowFullScreen />;
  if (/\.(?:mp4|webm|ogg|mov|m4v)$/i.test(parsed.pathname)) return <video key={url} src={url} controls preload="metadata" aria-label={title} />;
  return <div className="batch3-media-empty"><LuPlay aria-hidden="true" /><h2>{title}</h2><a className="button button-primary" href={url} target="_blank" rel="noopener noreferrer">Tonton Replay</a></div>;
}

function PageHead({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <header className="sensei-page-head"><p className="dash-kicker">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header>; }
