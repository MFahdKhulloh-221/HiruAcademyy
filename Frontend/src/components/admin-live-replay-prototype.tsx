"use client";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { LuSearch } from "react-icons/lu";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge, AdminTabs } from "@/components/admin-primitives";
import { emptyLiveReplay, liveReplayFixtures, liveReplayLevels, liveReplaySensei, liveStatuses, replayStatuses, type LiveReplayRecord } from "@/lib/admin-live-replay-fixtures";

function safeUrl(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}

function ReplayMedia({ item }: { item: LiveReplayRecord }) {
  const video = useRef<HTMLVideoElement>(null);
  const thumbnail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const player = video.current;
    const image = thumbnail.current;
    const videoUrl = item.video ? URL.createObjectURL(item.video) : "";
    const imageUrl = item.thumbnail ? URL.createObjectURL(item.thumbnail) : "";
    if (player && videoUrl) { player.src = videoUrl; player.load(); }
    if (image) image.style.backgroundImage = imageUrl ? `url("${imageUrl}")` : "";
    return () => {
      if (player) { player.pause(); player.removeAttribute("src"); player.load(); }
      if (image) image.style.backgroundImage = "";
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [item.video, item.thumbnail]);
  return <div className="replay-featured-preview alr-media">
    <div ref={thumbnail} role="img" aria-label={item.thumbnail ? `Thumbnail ${item.title}` : "Thumbnail belum tersedia"} className="alr-thumbnail" />
    {item.video ? <video ref={video} controls preload="metadata" aria-label={item.title} /> : safeUrl(item.url) ? <a className="button button-primary" href={item.url} target="_blank" rel="noopener noreferrer">Tonton Replay</a> : <p>Rekaman belum tersedia</p>}
  </div>;
}

function StudentPreview({ item }: { item: LiveReplayRecord }) {
  const date = item.date ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(`${item.date}T00:00:00+07:00`)) : "Tanggal OPEN";
  if (item.kind === "live") return <section className="alr-preview">
    <p className="dash-kicker">BELAJAR DENGAN SENSEI • JADWAL KELAS</p>
    <h2>Jadwal cohort dan sesi bersama Sensei</h2>
    <aside className="upcoming-panel"><p className="dash-kicker">Sesi mendatang</p><div className="schedule-session"><div><strong>{item.title || "Judul OPEN"}</strong><small>{date} • {item.start || "Jam OPEN"}{item.end && ` – ${item.end}`} WIB • {item.sensei || "Sensei OPEN"}</small></div><AdminStatusBadge status={item.status} /></div></aside>
    <article className="class-session-card"><p className="dash-kicker">DETAIL KELAS • BIMBINGAN SENSEI</p><h3>{item.chapter || item.title || "Chapter OPEN"}</h3><p>{item.program || "Program OPEN"}</p><p>{item.description}</p>{item.status === "Terjadwal" && safeUrl(item.url) ? <a className="button button-primary" href={item.url} target="_blank" rel="noopener noreferrer">Link Aktif Saat Sesi</a> : <button className="button" type="button" disabled>Link Zoom belum aktif</button>}</article>
  </section>;
  return <section className="alr-preview replay-page-container"><p className="dash-kicker">BELAJAR DENGAN SENSEI • REPLAY KELAS</p><h2>Rekaman Sesi Kelas Bersama Sensei</h2><section className="replay-featured-card"><ReplayMedia item={item} /><div className="replay-featured-info"><div className="replay-featured-badges"><span>{item.program || "Level OPEN"}</span><AdminStatusBadge status={item.status} /></div><h3>{item.title || "Judul OPEN"}</h3><p>{item.description}</p><small>{item.chapter || "Chapter OPEN"} • {date} • {item.sensei || "Sensei OPEN"}</small></div></section></section>;
}

export function AdminLiveReplayPrototype() {
  const [rows, setRows] = useState<LiveReplayRecord[]>(() => liveReplayFixtures.map((item) => ({ ...item })));
  const [tab, setTab] = useState("Jadwal Live");
  const [draft, setDraft] = useState<LiveReplayRecord | null>(null);
  const [view, setView] = useState<LiveReplayRecord | null>(null);
  const [deleting, setDeleting] = useState<LiveReplayRecord | null>(null);
  const [search, setSearch] = useState("");
  const [program, setProgram] = useState("");
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const kind = tab === "Jadwal Live" ? "live" : "replay";
  const statuses = kind === "live" ? liveStatuses : replayStatuses;
  const query = search.trim().toLowerCase();
  const filtered = rows.filter((item) => item.kind === kind && (!program || item.program === program) && (!status || item.status === status) && [item.title, item.chapter, item.sensei, item.description, item.program].some((value) => value.toLowerCase().includes(query)));
  const visible = [...filtered].sort((a, b) => kind === "replay" ? Number(a.order) - Number(b.order) : (a.date ? `${a.date}T${a.start}` : "z").localeCompare(b.date ? `${b.date}T${b.start}` : "z"));
  const calendarMonth = month || visible.find((item) => item.date)?.date.slice(0, 7) || "";
  const calendarDate = calendarMonth ? new Date(`${calendarMonth}-01T00:00:00Z`) : null;
  const calendarDays = calendarDate ? new Date(Date.UTC(calendarDate.getUTCFullYear(), calendarDate.getUTCMonth() + 1, 0)).getUTCDate() : 0;
  const offset = calendarDate ? (calendarDate.getUTCDay() + 6) % 7 : 0;

  function edit(item: LiveReplayRecord) { setError(""); setDraft({ ...item }); }
  function upload(event: ChangeEvent<HTMLInputElement>, field: "video" | "thumbnail") {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !draft) return;
    if (!file.type.startsWith(field === "video" ? "video/" : "image/")) { setError(field === "video" ? "Pilih file video dengan MIME video/*." : "Pilih thumbnail dengan MIME image/*."); return; }
    setDraft({ ...draft, [field]: file, ...(field === "video" ? { url: "" } : {}) }); setError("");
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const next = { ...draft, title: draft.title.trim(), chapter: draft.chapter.trim(), url: draft.url.trim(), description: draft.description.trim() };
    if (!next.title || !liveReplayLevels.includes(next.program) || !next.chapter || !liveReplaySensei.includes(next.sensei)) { setError("Isi judul, program, chapter/sesi, dan Sensei."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next.date) || !Number.isFinite(Date.parse(`${next.date}T00:00:00+07:00`)) || new Date(`${next.date}T00:00:00Z`).toISOString().slice(0, 10) !== next.date) { setError("Isi tanggal yang valid."); return; }
    if (!(next.kind === "live" ? liveStatuses : replayStatuses).includes(next.status)) { setError("Pilih status yang tersedia."); return; }
    if (next.kind === "live") {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.start) || (next.end && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.end) || next.end <= next.start))) { setError("Jam selesai harus setelah jam mulai pada tanggal yang sama (WIB)."); return; }
      if (!safeUrl(next.url)) { setError("Isi URL Zoom HTTP/HTTPS yang valid tanpa kredensial."); return; }
    } else {
      if (next.video ? !next.video.type.startsWith("video/") : !safeUrl(next.url)) { setError("Pilih video dengan MIME video/* atau URL HTTP/HTTPS yang valid tanpa kredensial."); return; }
      if (next.thumbnail && !next.thumbnail.type.startsWith("image/")) { setError("Thumbnail harus memiliki MIME image/*."); return; }
      if (!/^\d+$/.test(next.order) || !Number.isSafeInteger(Number(next.order)) || Number(next.order) < 1) { setError("Urutan harus angka bulat positif."); return; }
    }
    setRows((current) => current.some((item) => item.id === next.id) ? current.map((item) => item.id === next.id ? next : item) : [...current, next]);
    setDraft(null); setError(""); setMessage("Disimpan untuk sesi ini. Jadwal dan replay siswa tidak berubah.");
  }
  function remove() {
    if (!deleting) return;
    setRows((current) => current.filter((item) => item.id !== deleting.id));
    setView((current) => current?.id === deleting.id ? null : current);
    setDeleting(null); setMessage("Dihapus dari sesi ini.");
  }
  const actions = (item: LiveReplayRecord) => <div className="admin-page-actions">
    <button type="button" className="button" onClick={() => setView({ ...item })} aria-label={`Lihat ${item.title}`}>Lihat</button>
    <button type="button" className="button" onClick={() => edit(item)} aria-label={`Edit ${item.title}`}>Edit</button>
    {item.kind === "live" && item.status === "Terjadwal" && <button type="button" className="button" aria-label={`Batalkan ${item.title}`} onClick={() => { setRows((current) => current.map((row) => row.id === item.id ? { ...row, status: "Dibatalkan" } : row)); setMessage("Sesi dibatalkan untuk pratinjau lokal."); }}>Batalkan</button>}
    <button type="button" className="button" onClick={() => setDeleting(item)} aria-label={`Hapus ${item.title}`}>Hapus</button>
  </div>;
  const table = (items: LiveReplayRecord[], caption: string) => <AdminDataTable caption={caption} rows={items} rowKey={(item) => item.id} columns={[
    { key: "title", header: "Judul", cell: (item) => item.title },
    { key: "program", header: "Program", cell: (item) => item.program || "OPEN" },
    { key: "chapter", header: "Chapter / Sesi", cell: (item) => item.chapter || "OPEN" },
    { key: "date", header: "Tanggal", cell: (item) => item.date || "OPEN" },
    { key: "sensei", header: "Sensei", cell: (item) => item.sensei || "OPEN" },
    ...(kind === "live" ? [{ key: "time", header: "Jam WIB", cell: (item: LiveReplayRecord) => item.start && item.end ? `${item.start} – ${item.end}` : "OPEN" }] : [{ key: "order", header: "Urutan", cell: (item: LiveReplayRecord) => item.order }]),
    { key: "status", header: "Status", cell: (item) => <AdminStatusBadge status={item.status} /> },
  ]} actions={{ cell: actions }} />;

  return <AdminShell current="/admin/kelas-jadwal"><main className="admin-public-prototype admin-live-replay-prototype">
    <AdminPageHeader title="Jadwal & Replay" description="Pratinjau lokal. Perubahan hanya berlaku selama sesi ini; file tidak diunggah." actions={<button type="button" className="button button-primary" onClick={() => edit({ ...emptyLiveReplay(kind), id: crypto.randomUUID(), order: String(rows.filter((item) => item.kind === "replay").length + 1) })}>{kind === "live" ? "Tambah Jadwal Live" : "Tambah Replay"}</button>} />
    <p role="status">{message}</p>
    <AdminTabs tabs={["Jadwal Live", "Replay"]} active={tab} onChange={(value) => { setTab(value); setStatus(""); }} label="Jadwal dan replay">
      <AdminFilterToolbar><label className="alr-search"><input type="search" aria-label="Cari judul, chapter, atau Sensei" placeholder="Cari judul, chapter, atau Sensei" value={search} onChange={(event) => setSearch(event.target.value)} /><LuSearch aria-hidden="true" /></label><label className="admin-field">Program<select value={program} onChange={(event) => setProgram(event.target.value)}><option value="">Semua program</option>{liveReplayLevels.map((level) => <option key={level}>{level}</option>)}</select></label><label className="admin-field">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua status</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label></AdminFilterToolbar>
      {kind === "live" ? <><AdminSection title="Kalender"><label className="admin-field">Bulan<input type="month" value={calendarMonth} onChange={(event) => setMonth(event.target.value)} /></label>{calendarDate ? <div className="alr-calendar">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => <strong key={day}>{day}</strong>)}{Array.from({ length: offset }, (_, index) => <div key={`blank-${index}`} aria-hidden="true" />)}{Array.from({ length: calendarDays }, (_, index) => { const date = `${calendarMonth}-${String(index + 1).padStart(2, "0")}`; return <div key={date}><time dateTime={date}>{index + 1}</time>{visible.filter((item) => item.date === date).map((item) => <button type="button" key={item.id} onClick={() => setView(item)} aria-label={`${item.title}, ${date}, ${item.status}`}><span>{item.start} {item.title}</span><small>{item.status}</small></button>)}</div>; })}</div> : <p>Tanggal fixture belum ditentukan. Kalender muncul setelah tanggal diisi.</p>}</AdminSection><AdminSection title="Daftar Jadwal Live">{table(visible, "Jadwal Live")}</AdminSection></> : liveReplayLevels.filter((level) => !program || program === level).map((level) => <AdminSection key={level} title={level}>{table(visible.filter((item) => item.program === level), `Replay ${level}`)}</AdminSection>)}
    </AdminTabs>
    <AdminDialog open={Boolean(draft)} title={draft?.kind === "live" ? "Jadwal Live" : "Replay"} close={closeEditor}>{draft && <form className="admin-prototype-form alr-form" onSubmit={save} noValidate>
      <label className="admin-field">Judul<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="admin-field">Program<select required value={draft.program} onChange={(event) => setDraft({ ...draft, program: event.target.value })}><option value="">Pilih program</option>{liveReplayLevels.map((level) => <option key={level}>{level}</option>)}</select></label>
      <label className="admin-field">Chapter / Sesi<input required value={draft.chapter} onChange={(event) => setDraft({ ...draft, chapter: event.target.value })} /></label>
      <label className="admin-field">Tanggal<input required type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
      {draft.kind === "live" && <div className="alr-times"><label className="admin-field">Jam mulai (WIB)<input type="time" required value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label><label className="admin-field">Jam selesai (WIB, opsional)<input type="time" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label></div>}
      <label className="admin-field">Sensei<select required value={draft.sensei} onChange={(event) => setDraft({ ...draft, sensei: event.target.value })}><option value="">Pilih Sensei</option>{liveReplaySensei.map((sensei) => <option key={sensei}>{sensei}</option>)}</select></label>
      <label className="admin-field">{draft.kind === "live" ? "URL Zoom" : "URL video (HTTP/HTTPS)"}<input type="url" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value, ...(draft.kind === "replay" ? { video: null } : {}) })} /></label>
      {draft.kind === "replay" && <><label className="admin-field">File video (video/*)<input type="file" accept="video/*" onChange={(event) => upload(event, "video")} /><small>{draft.video?.name || "Belum ada file"}</small></label>{draft.video && <button type="button" className="button" onClick={() => setDraft({ ...draft, video: null })}>Hapus file video</button>}<label className="admin-field">Thumbnail (opsional)<input type="file" accept="image/*" onChange={(event) => upload(event, "thumbnail")} /><small>{draft.thumbnail?.name || "Belum ada thumbnail"}</small></label>{draft.thumbnail && <button type="button" className="button" onClick={() => setDraft({ ...draft, thumbnail: null })}>Hapus thumbnail</button>}<label className="admin-field">Urutan<input type="number" min="1" step="1" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} /></label></>}
      <label className="admin-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{(draft.kind === "live" ? liveStatuses : replayStatuses).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">{draft.kind === "live" ? "Catatan" : "Deskripsi (opsional)"}<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <h3>Pratinjau siswa • Draft lokal</h3><StudentPreview item={draft} />
      {error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary">Simpan</button></div>
    </form>}</AdminDialog>
    <AdminDialog open={Boolean(view)} title="Pratinjau siswa" close={closeView}>{view && <StudentPreview item={view} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus data?" close={closeDelete} actions={<><button type="button" className="button" onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" onClick={remove}>Hapus</button></>}><p>Hapus {deleting?.title} dari sesi ini? Jadwal dan replay siswa tidak berubah.</p></AdminDialog>
    <style jsx global>{`
      .admin-live-replay-prototype { display: grid; gap: 20px; }
      .admin-live-replay-prototype .alr-search { display: flex; align-items: center; position: relative; flex: 1; }
      .admin-live-replay-prototype .alr-search input { width: 100%; padding: 12px 44px 12px 12px; }
      .admin-live-replay-prototype .alr-search svg { position: absolute; right: 14px; pointer-events: none; }
      .admin-live-replay-prototype .alr-form { display: grid; gap: 16px; }
      .admin-live-replay-prototype input, .admin-live-replay-prototype select, .admin-live-replay-prototype textarea { min-height: 44px; border: 1px solid #ddd; border-radius: 10px; padding: 10px; min-width: 0; }
      .admin-live-replay-prototype button, .admin-live-replay-prototype .button { min-height: 44px; }
      .admin-live-replay-prototype :focus-visible { outline: 3px solid #954900; outline-offset: 3px; }
      .admin-live-replay-prototype .alr-times { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .admin-live-replay-prototype .alr-calendar { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); gap: 4px; margin-top: 16px; }
      .admin-live-replay-prototype .alr-calendar > div { border: 1px solid #eee; min-height: 80px; padding: 6px; }
      .admin-live-replay-prototype .alr-calendar button { display: grid; width: 100%; background: #fff7ef; color: #5a2a00; border: 1px solid #f48220; border-radius: 6px; text-align: left; overflow-wrap: anywhere; padding: 4px; }
      .admin-live-replay-prototype .alr-preview { display: grid; gap: 16px; padding: 20px; background: #f9f9ff; border: 1px solid #eee; border-radius: 16px; }
      .admin-live-replay-prototype .alr-preview .schedule-session { display: flex; justify-content: space-between; gap: 16px; padding: 16px; background: white; border-radius: 12px; }
      .admin-live-replay-prototype .alr-preview small { display: block; }
      .admin-live-replay-prototype .class-session-card, .admin-live-replay-prototype .replay-featured-card { background: white; border: 1px solid #eee; border-radius: 16px; padding: 20px; }
      .admin-live-replay-prototype .replay-featured-card { display: grid; gap: 16px; }
      .admin-live-replay-prototype .replay-featured-badges { display: flex; gap: 12px; }
      .admin-live-replay-prototype .alr-media { display: grid; gap: 12px; }
      .admin-live-replay-prototype .alr-thumbnail { min-height: 120px; background: #fff7ef center / cover no-repeat; border-radius: 12px; }
      .admin-live-replay-prototype video { width: 100%; max-height: 360px; background: #171717; }
      @media (max-width:639px) { .admin-live-replay-prototype .alr-times { grid-template-columns: 1fr; } .admin-live-replay-prototype .alr-calendar { min-width: 540px; } .admin-live-replay-prototype .admin-section { overflow-x: auto; } .admin-live-replay-prototype .alr-preview .schedule-session { flex-direction: column; } }
    `}</style>
  </main></AdminShell>;
}
