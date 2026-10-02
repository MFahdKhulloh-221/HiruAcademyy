"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  LuArrowLeft,
  LuBookOpen,
  LuCircleHelp,
  LuInfo,
  LuLayers3,
  LuMaximize,
  LuPause,
  LuPlay,
  LuSearch,
  LuVolume2,
} from "react-icons/lu";
import { getReplayAccessLevels, replayLevels, replayMarkers, replays, scheduleSessions, type ReplayLevel } from "@/lib/sensei-mock";
import { usePublishedCurriculum } from "@/lib/curriculum-store";
import { formatStudentScheduleDate, usePublishedClassOperations, type StudentScheduleItem } from "@/lib/class-store";

type StateAction = { label: string; href?: string; onClick?: () => void };

function SenseiState({ eyebrow, title, status, description, facts, primary, secondary }: { eyebrow: string; title: string; status: string; description: string; facts: string[]; primary: StateAction; secondary: StateAction }) {
  const action = (item: StateAction, primaryAction: boolean) => item.href ? <Link className={`button ${primaryAction ? "button-primary" : "button-secondary"}`} href={item.href}>{item.label}</Link> : <button className={`button ${primaryAction ? "button-primary" : "button-secondary"}`} type="button" onClick={item.onClick}>{item.label}</button>;
  return <section className="sensei-status-panel"><p className="dash-kicker">{eyebrow}</p><h1>{title}</h1><span className="supporting-badge">{status}</span><p>{description}</p><div className="status-topic">{facts.map((fact) => <strong key={fact}>{fact}</strong>)}</div><div className="status-actions">{action(primary, true)}{action(secondary, false)}</div></section>;
}

export function ScheduleScreen() {
  const [view, setView] = useState<"calendar" | "list" | "empty">("calendar");
  const operations = usePublishedClassOperations();
  const sessions = useMemo(() => { const active = operations.schedule.map((session) => ({ ...session, meta: `${formatStudentScheduleDate(session.meta.split(" – ")[0])} – ${formatStudentScheduleDate(session.meta.split(" – ")[1] || session.meta)}` })); const keys = new Set(active.flatMap((session) => [session.id, session.title.toLowerCase()])); return [...scheduleSessions.filter((session) => !keys.has(session.id) && !keys.has(session.title.toLowerCase())), ...active]; }, [operations.schedule]);
  const [period, setPeriod] = useState(0);
  if (view === "empty") return <SenseiState eyebrow="ZOOM • EMPTY" title="Belum ada sesi pada periode ini" status="Processing" description="Jadwal akan muncul setelah cohort dan sesi dipublikasikan tim akademik." facts={["Status sistem", "Jadwal resmi", "Verifikasi paket"]} primary={{ label: "Kembali Jadwal", onClick: () => { setPeriod(0); setView("calendar"); } }} secondary={{ label: "Lihat Replay", href: "/replay?membership=sensei" }} />;
  return <><div className="sensei-title-row"><PageHead eyebrow="BELAJAR DENGAN SENSEI • JADWAL KELAS" title="Jadwal cohort dan sesi bersama Sensei" description="Tanggal, jam, durasi, Sensei, cohort, dan link kelas mengikuti konfigurasi jadwal." /><Link href="/replay?membership=sensei">Lihat Replay</Link></div><div className="sensei-controls"><button type="button" aria-label="Periode sebelumnya" onClick={() => { setPeriod(-1); setView("empty"); }}>Sebelumnya</button><span>{period === 0 ? "Periode aktif dari tim akademik" : "Periode tanpa sesi"}</span><button type="button" aria-label="Periode berikutnya" onClick={() => { setPeriod(1); setView("empty"); }}>Berikutnya</button><b>Cohort Aktif</b><button className={view === "calendar" ? "active" : ""} type="button" onClick={() => setView("calendar")}>Kalender</button><button className={view === "list" ? "active" : ""} type="button" onClick={() => setView("list")}>Daftar</button></div>{view === "calendar" ? <section className="schedule-layout"><div className="calendar-card"><div className="calendar-grid schedule-placeholder">{["Sen","Sel","Rab","Kam","Jum","Sab","Min","—","—","Zoom","—","—","Replay","—"].map((day, index) => day === "Zoom" ? <Link className="event" href="/schedule/chapter-4?membership=sensei" key={`${day}-${index}`}>{day}</Link> : <span className={day === "Replay" ? "event" : ""} key={`${day}-${index}`}>{day}</span>)}</div></div><SessionList sessions={sessions} /></section> : <SessionList sessions={sessions} />}<section className="sensei-announcement"><strong>Pengumuman</strong><p>Link Zoom aktif sesuai waktu dan jadwal yang ditentukan.</p></section><Link className="sensei-back" href="/dashboard?membership=sensei">Kembali Dashboard</Link></>;
}

function SessionList({ sessions }: { sessions: (typeof scheduleSessions[number] | StudentScheduleItem)[] }) {
  return <aside className="upcoming-panel"><p className="dash-kicker">Sesi mendatang</p><small>Data sesi diperbarui secara berkala.</small>{sessions.map((session) => { const href = session.id === "chapter-4" ? "/schedule/chapter-4?membership=sensei" : "meetingUrl" in session && session.chapter ? `/schedule/${session.chapter}?membership=sensei` : undefined; const content = <><div><strong>{session.title}</strong><small>{session.meta}{"senseiName" in session && session.senseiName ? ` • ${session.senseiName}` : ""}{"chapter" in session && session.chapter ? ` • ${session.chapter}` : ""}</small></div><span>{session.status}</span></>; return href ? <Link className="schedule-session" href={href} key={session.id}>{content}</Link> : <div className="schedule-session" key={session.id}>{content}</div>; })}</aside>;
}

export function ClassDetailScreen() {
  const [state, setState] = useState<"detail" | "zoom" | "reminder">("detail");
  if (state === "zoom") return <SenseiState eyebrow="ZOOM • LINK UNAVAILABLE" title="Link Zoom belum aktif" status="Unavailable" description="Link sesi bimbingan tatap muka akan aktif menjelang waktu kelas." facts={["Status sistem", "Jadwal resmi", "Verifikasi paket"]} primary={{ label: "Kembali ke Detail", onClick: () => setState("detail") }} secondary={{ label: "Lihat Jadwal", href: "/schedule?membership=sensei" }} />;
  if (state === "reminder") return <SenseiState eyebrow="CLASS • REMINDER" title="Pengingat kelas tersimpan" status="Saved" description="Notifikasi pengingat sesi bimbingan Sensei berhasil diaktifkan." facts={["Status sistem", "Jadwal resmi", "Verifikasi paket"]} primary={{ label: "Kembali ke Kelas", onClick: () => setState("detail") }} secondary={{ label: "Lihat Jadwal", href: "/schedule?membership=sensei" }} />;
  return (
    <>
      <Link className="sensei-back" href="/schedule?membership=sensei">
        <LuArrowLeft aria-hidden="true" /> Kembali Jadwal
      </Link>
      <PageHead eyebrow="DETAIL KELAS • BIMBINGAN SENSEI" title="Chapter 4 — Sesi bersama Sensei" description="Detail lengkap pertemuan, materi modul, dan persiapan kelas bimbingan." />
      <section className="class-session-card">
        <div><span>Cohort Aktif</span><b>Terjadwal</b></div>
        <p className="dash-kicker">Zoom</p>
        <h2>Sensei dan jadwal terstruktur</h2>
        <p>Hari/Tanggal • Jam WIB • Durasi 90 Menit • Link Zoom aktif menjelang sesi.</p>
        <button className="button button-dark" type="button" onClick={() => setState("zoom")}>Link Aktif Saat Sesi</button>
      </section>
      <section className="class-detail-grid">
        <article>
          <h2>Agenda kelas</h2>
          {["Review materi Chapter 4","Latihan pola kalimat","Tanya jawab dan rangkuman kelas","Arahan aktivitas berikutnya"].map((item, index) => (
            <div className="class-agenda" key={item}>
              <strong>{String(index + 1).padStart(2,"0")}</strong>
              <span>{item}</span>
            </div>
          ))}
        </article>
        <article>
          <h2>Materi pendukung</h2>
          {[
            { icon: <LuBookOpen aria-hidden="true" />, title: "Ringkasan grammar", detail: "Dibuka dari modul materi chapter." },
            { icon: <LuLayers3 aria-hidden="true" />, title: "Kanji sesi", detail: "Daftar kanji yang dibahas pada kelas." },
            { icon: <LuCircleHelp aria-hidden="true" />, title: "Pertanyaan cohort", detail: "Topik diskusi yang dikirim sebelum kelas." },
          ].map((item) => (
            <div className="class-material" key={item.title}>
              <span style={{ display: "grid", placeItems: "center", width: "32px", height: "32px", borderRadius: "8px", background: "var(--soft)", color: "var(--orange-dark)" }}>
                {item.icon}
              </span>
              <span>
                <b>{item.title}</b>
                <small>{item.detail}</small>
              </span>
            </div>
          ))}
        </article>
      </section>
      <section className="class-reminders">
        <h2>Pengingat kelas</h2>
        <div>
          <span>Notifikasi aplikasi</span><strong>Aktif</strong>
          <span>Email reminder</span><strong>Mengikuti pengaturan</strong>
          <span>Pengingat waktu</span><strong>30 menit sebelum</strong>
        </div>
        <button className="button button-primary" type="button" onClick={() => setState("reminder")}>Simpan Pengingat</button>
      </section>
      <div className="learning-question-actions">
        <Link className="button button-secondary" href="/replay?membership=sensei">Lihat Replay</Link>
      </div>
      <section className="sensei-announcement">
        <strong>Pengumuman</strong>
        <p>Jadwal dan rekaman replay diperbarui secara berkala setelah sesi selesai.</p>
      </section>
    </>
  );
}

type ReplayItem = {
  id: string;
  level: ReplayLevel;
  title: string;
  description: string;
  category: string;
  featured?: boolean;
  youtubeVideoId?: string;
  durationMinutes?: number;
  date?: string;
};

export function ReplayScreen({ purchasedLevel = "N4" }: { purchasedLevel?: string }) {
  const curriculum = usePublishedCurriculum();
  const accessLevels = getReplayAccessLevels("sensei", purchasedLevel);
  const [filter, setFilter] = useState<ReplayLevel>(accessLevels.at(-1) ?? "N5");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState(false);

  const publishedReplays: ReplayItem[] = useMemo(() => {
    return (curriculum.replays || [])
      .filter((r) => r.status === "Published")
      .map((r) => {
        const programCode = r.programCode?.toUpperCase();
        const level = replayLevels.includes(programCode as ReplayLevel) ? programCode as ReplayLevel : "N4";
        return ({
        id: r.id,
        title: r.title,
        description: r.description,
        level,
        category: level,
        featured: false,
        youtubeVideoId: r.youtubeVideoId,
        durationMinutes: r.durationMinutes || 90,
        date: r.date,
      });
      });
  }, [curriculum.replays]);

  const allReplays: ReplayItem[] = useMemo(() => {
    if (!publishedReplays.length) return replays;
    return [
      ...replays.filter(
        (orig) =>
          !publishedReplays.some(
            (p) => p.id === orig.id || p.title.toLowerCase() === orig.title.toLowerCase()
          )
      ),
      ...publishedReplays,
    ];
  }, [publishedReplays]);

  const visible = useMemo(
    () =>
      allReplays.filter(
        (item) =>
          item.level === filter &&
          item.title.toLowerCase().includes(search.toLowerCase())
      ),
    [allReplays, filter, search]
  );
  const featured = visible[0];

  if (processing) {
    return (
      <SenseiState
        eyebrow="REPLAY • PROCESSING"
        title="Replay sedang diproses"
        status="Processing"
        description="Rekaman, transkrip, dan materi sedang disiapkan sebelum dipublikasikan."
        facts={["Status sistem", "Jadwal resmi", "Verifikasi paket"]}
        primary={{ label: "Kembali ke Replay", onClick: () => setProcessing(false) }}
        secondary={{ label: "Lihat Jadwal", href: "/schedule?membership=sensei" }}
      />
    );
  }

  return (
    <div className="replay-page-container">
      <div className="sensei-title-row replay-head-row">
        <PageHead
          eyebrow="BELAJAR DENGAN SENSEI • REPLAY KELAS"
          title="Rekaman Sesi Kelas Bersama Sensei"
          description="Tonton kembali penjelasan materi, pembahasan latihan, dan sesi tanya jawab interaktif."
        />
        <Link href="/schedule?membership=sensei" className="button button-secondary replay-schedule-btn">
          Lihat Jadwal Kelas
        </Link>
      </div>

      <div className="replay-filter-bar">
        <label className="replay-search-input">
          <span aria-hidden="true"><LuSearch /></span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari judul rekaman, chapter, atau topik..."
          />
        </label>
        <div className="replay-tabs-group">
          {replayLevels.map((item) => {
            const accessible = accessLevels.includes(item);
            return <button
              type="button"
              className={`replay-tab-btn ${filter === item ? "active" : ""}`}
              onClick={() => accessible && setFilter(item)}
              disabled={!accessible}
              aria-label={`${item}${accessible ? "" : ", terkunci"}`}
              key={item}
            >
              {item}{accessible ? "" : " • Terkunci"}
            </button>;
          })}
        </div>
      </div>

      {featured && (
        <section className="replay-featured-card">
          <div className="replay-featured-preview">
            <span className="replay-play-icon" aria-hidden="true"><LuPlay /></span>
            <span className="replay-duration-pill">90 Menit</span>
          </div>
          <div className="replay-featured-info">
            <div className="replay-featured-badges">
              <span className="replay-badge-status">Rekaman Terbaru</span>
              <span className="replay-badge-cohort">Cohort Aktif</span>
            </div>
            <h2>{featured.title}</h2>
            <p>{featured.description}</p>
            <div className="replay-featured-actions">
              <Link
                className="button button-primary"
                href={
                  featured.youtubeVideoId
                    ? `/replay/chapter-4?membership=sensei&id=${encodeURIComponent(featured.id)}&v=${encodeURIComponent(featured.youtubeVideoId)}`
                    : `/replay/chapter-4?membership=sensei&id=${encodeURIComponent(featured.id)}`
                }
              >
                Putar Rekaman
              </Link>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setProcessing(true)}
              >
                Cek Status Sesi
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="replay-section-header">
        <h2>Daftar Rekaman Sesi</h2>
        <span>{visible.length} rekaman tersedia</span>
      </div>

      {visible.length ? (
        <section className="replay-cards-grid">
          {visible.map((item) => (
            <article key={item.id} className="replay-session-card">
              <div className="replay-card-thumb">
                <LuPlay aria-hidden="true" />
                <span className="replay-time-tag">
                  {item.durationMinutes ? `${item.durationMinutes} Menit` : "90 Menit"}
                </span>
              </div>
              <div className="replay-card-body">
                <span className="replay-category-tag">{item.category || "Kelas Rutin"}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="replay-card-footer">
                  <Link
                    href={
                      item.youtubeVideoId
                        ? `/replay/chapter-4?membership=sensei&id=${encodeURIComponent(item.id)}&v=${encodeURIComponent(item.youtubeVideoId)}`
                        : `/replay/chapter-4?membership=sensei&id=${encodeURIComponent(item.id)}`
                    }
                    className="button button-primary"
                  >
                    Buka Replay
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="library-empty">
          <h2>Tidak ada rekaman ditemukan</h2>
          <p>Ubah kata kunci pencarian atau filter untuk menemukan rekaman lain.</p>
        </section>
      )}

      <aside className="sensei-announcement replay-announcement-centered">
        <div className="replay-announcement-header">
          <LuInfo aria-hidden="true" />
          <strong>Pengumuman</strong>
        </div>
        <p>Replay tampil setelah rekaman sesi selesai diverifikasi dan dipublikasikan.</p>
      </aside>
    </div>
  );
}

export function ReplayPlayerScreen({ youtubeVideoId, purchasedLevel = "N4" }: { youtubeVideoId?: string; purchasedLevel?: string }) {
  const searchParams = useSearchParams();
  const curriculum = usePublishedCurriculum();
  const queryVideoId = searchParams.get("v") || undefined;
  const queryReplayId = searchParams.get("id") || undefined;
  const accessibleLevels = getReplayAccessLevels("sensei", purchasedLevel);
  const matchedDummy = replays.find((item) => item.id === queryReplayId && accessibleLevels.includes(item.level));
  const matchedPublished = queryReplayId
    ? curriculum.replays.find((r) => r.id === queryReplayId && accessibleLevels.includes((r.programCode?.toUpperCase() || "N4") as ReplayLevel))
    : curriculum.replays.find((r) => r.youtubeVideoId && accessibleLevels.includes((r.programCode?.toUpperCase() || "N4") as ReplayLevel)) || curriculum.replays[0];

  const activeVideoId = youtubeVideoId || queryVideoId || matchedPublished?.youtubeVideoId;

  const [tab, setTab] = useState("Ringkasan");
  const [state, setState] = useState<"player" | "error">("player");
  const [marker, setMarker] = useState("00:00");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState("1x");

  const currentMarkerObj = replayMarkers.find(([time]) => time === marker);
  const markerLabel = currentMarkerObj ? currentMarkerObj[1] : "Pembukaan";

  if (state === "error") {
    return (
      <SenseiState
        eyebrow="REPLAY • ERROR"
        title="Replay belum dapat dimuat"
        status="Error"
        description="Terjadi kendala saat memuat rekaman sesi. Silakan coba kembali."
        facts={["Status sistem", "Jadwal resmi", "Verifikasi paket"]}
        primary={{ label: "Coba Lagi", onClick: () => setState("player") }}
        secondary={{ label: "Kembali ke List", href: "/replay?membership=sensei" }}
      />
    );
  }

  return (
    <>
      <Link className="sensei-back" href="/replay?membership=sensei">
        <LuArrowLeft aria-hidden="true" /> Kembali ke Replay
      </Link>
      <PageHead
        eyebrow="REPLAY • CHAPTER 4 • COHORT AKTIF"
        title={matchedPublished?.title || matchedDummy?.title || "Pola Kalimat dan Kehidupan Sehari-hari"}
        description={matchedPublished?.description || matchedDummy?.description || "Rekaman bimbingan Sensei lengkap dengan chapter markers, materi modul, dan ringkasan kelas."}
      />

      {/* YouTube-Ready Video Player Structure */}
      <section
        className="replay-player-container"
        style={{
          borderRadius: "20px",
          overflow: "hidden",
          background: "var(--navy)",
          color: "#fff",
          marginBottom: "24px",
          border: "1px solid #3d4554",
        }}
      >
        {activeVideoId ? (
          <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", height: 0 }}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${activeVideoId}?rel=0&modestbranding=1`}
              title="YouTube video player"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16 / 9",
              minHeight: "340px",
              background: "linear-gradient(135deg, #1f242d 0%, #2a313d 100%)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "24px",
            }}
          >
            {/* Top Bar: Session Info */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  background: "rgba(255, 255, 255, 0.15)",
                  backdropFilter: "blur(8px)",
                  fontSize: "11px",
                  fontWeight: "700",
                }}
              >
                Sesi Live Replay • 58:10
              </span>
              <span style={{ fontSize: "12px", color: "#dce2f3" }}>
                Bagian Aktif: <strong>{markerLabel}</strong> ({marker})
              </span>
            </div>

            {/* Center Play Surface */}
            <div style={{ textAlign: "center", margin: "auto" }}>
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                aria-label={isPlaying ? "Jeda video" : "Mulai video"}
                style={{
                  width: "68px",
                  height: "68px",
                  borderRadius: "50%",
                  background: "var(--orange)",
                  color: "#5a2a00",
                  border: 0,
                  display: "grid",
                  placeItems: "center",
                  fontSize: "26px",
                  cursor: "pointer",
                  margin: "0 auto 12px",
                  boxShadow: "0 8px 24px rgba(244, 130, 32, 0.35)",
                  transition: "transform 0.2s ease",
                }}
              >
                {isPlaying ? <LuPause /> : <LuPlay style={{ marginLeft: "4px" }} />}
              </button>
              <strong style={{ fontSize: "16px", display: "block", color: "#fff" }}>
                {isPlaying ? "Memutar Rekaman..." : "Mulai Putar Replay"}
              </strong>
              <small style={{ color: "#a0a7ba", fontSize: "12px" }}>
                Player siap terhubung ke video pembelajaran YouTube
              </small>
            </div>

            {/* Bottom Controls Bar */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.5)",
                backdropFilter: "blur(12px)",
                borderRadius: "14px",
                padding: "10px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {/* Timeline scrubber bar */}
              <div
                style={{
                  width: "100%",
                  height: "6px",
                  borderRadius: "999px",
                  background: "rgba(255, 255, 255, 0.2)",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: marker === "00:00" ? "5%" : marker === "08:20" ? "20%" : marker === "24:15" ? "45%" : marker === "46:40" ? "80%" : "95%",
                    height: "100%",
                    borderRadius: "999px",
                    background: "var(--orange)",
                  }}
                />
              </div>

              {/* Controls and buttons */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{ border: 0, background: "none", color: "#fff", cursor: "pointer", fontSize: "16px" }}
                  >
                    {isPlaying ? <LuPause /> : <LuPlay />}
                  </button>
                  <span style={{ fontSize: "12px", color: "#dce2f3", fontWeight: "700" }}>
                    {marker} / 58:10
                  </span>
                  <LuVolume2 aria-hidden="true" style={{ fontSize: "16px", color: "#a0a7ba" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "11px", color: "#a0a7ba" }}>Kecepatan:</span>
                  {["1x", "1.25x", "1.5x"].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => setPlaybackSpeed(speed)}
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: 0,
                        background: playbackSpeed === speed ? "var(--orange)" : "rgba(255,255,255,0.1)",
                        color: playbackSpeed === speed ? "#5a2a00" : "#fff",
                        fontSize: "10px",
                        fontWeight: "800",
                        cursor: "pointer",
                      }}
                    >
                      {speed}
                    </button>
                  ))}
                  <button
                    type="button"
                    style={{ border: 0, background: "none", color: "#fff", cursor: "pointer", fontSize: "16px" }}
                    aria-label="Layar penuh"
                  >
                    <LuMaximize />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Tabs */}
      <div className="replay-tabs" role="tablist">
        {["Ringkasan", "Transkrip", "Materi", "Catatan"].map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>

      <section className="replay-content" role="tabpanel">
        {tab === "Ringkasan" && (
          <>
            <h2>Ringkasan kelas</h2>
            <p>Replay mencakup review Chapter 4, latihan pola kalimat, diskusi cohort, serta arahan aktivitas berikutnya.</p>
          </>
        )}
        {tab === "Transkrip" && (
          <>
            <p className="dash-kicker">TRANSKRIP SESI</p>
            <p>Transkrip lengkap mengikuti pembahasan kelas Sensei. Gunakan penanda waktu di bawah untuk melompat ke bagian materi tertentu.</p>
          </>
        )}
        {tab === "Materi" && (
          <>
            <h2>Materi terkait</h2>
            <div className="replay-summary">
              <span>Ringkasan Grammar</span>
              <span>Daftar Kanji</span>
              <span>Latihan Sesi</span>
            </div>
          </>
        )}
        {tab === "Catatan" && (
          <p>Catatan dan rangkuman poin penting sesi bimbingan bersama Sensei.</p>
        )}
      </section>

      {/* Chapter Markers */}
      <section className="replay-markers">
        <h2>Chapter markers</h2>
        <p style={{ color: "var(--muted)", fontSize: "12px", margin: "4px 0 16px" }}>
          Klik penanda waktu untuk melompat ke bagian pembahasan:
        </p>
        {replayMarkers.map(([time, label]) => (
          <button
            className={marker === time ? "active" : ""}
            type="button"
            onClick={() => {
              setMarker(time);
              setIsPlaying(true);
            }}
            key={time}
          >
            <strong>{time}</strong>
            <span>{label}</span>
          </button>
        ))}
      </section>

      <section className="sensei-announcement">
        <strong>Status publikasi</strong>
        <p>Replay, transkrip, dan materi bimbingan tersedia lengkap setelah sesi diverifikasi.</p>
      </section>
      <Link className="button button-secondary" href="/schedule/chapter-4?membership=sensei">
        Lihat Detail Pertemuan
      </Link>
    </>
  );
}

function PageHead({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="sensei-page-head">
      <p className="dash-kicker">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
