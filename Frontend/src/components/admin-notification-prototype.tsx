"use client";

import { type FormEvent, useCallback, useState } from "react";
import { LuAward, LuBell, LuBookOpen, LuCalendar, LuClock, LuRotateCcw, LuSearch } from "react-icons/lu";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";

type Notification = { id: string; type: string; title: string; body: string; ctaLabel: string; preset: string; path: string; audience: string; level: string; status: string; time: string };
const types = ["Pengumuman", "Belajar", "Kelas", "Achievement", "Akun"];
const audiences = ["All", "Free", "Mandiri", "Sensei"];
const levels = ["N5", "N4", "N3", "N2"];
const destinations: Record<string, string> = { None: "", chapter: "/learn/n4/chapter-4", schedule: "/schedule", replay: "/replay", certificate: "/certificate", tryout: "/tryout", invoice: "/invoice", custom: "" };
const fixtures: Notification[] = [
  { id: "chapter", type: "Belajar", title: "Materi Chapter 4 tersedia", body: "Lanjutkan video, modul, dan latihan pada journey aktif.", ctaLabel: "Buka Chapter", preset: "chapter", path: "", audience: "Mandiri", level: "N4", status: "Draft", time: "" },
  { id: "schedule", type: "Kelas", title: "Pengingat sesi Zoom", body: "Sesi bimbingan mingguan bersama Sensei akan dimulai besok malam.", ctaLabel: "Lihat Jadwal", preset: "schedule", path: "", audience: "Sensei", level: "", status: "Draft", time: "" },
  { id: "replay", type: "Kelas", title: "Replay kelas sudah dipublikasikan", body: "Replay dapat ditonton selama masa aktif cohort.", ctaLabel: "Buka Replay", preset: "replay", path: "", audience: "Sensei", level: "", status: "Draft", time: "" },
  { id: "certificate", type: "Achievement", title: "Sertifikat digital tersedia", body: "Sertifikat dapat dilihat dan diunduh dari Certificate Center.", ctaLabel: "Buka Sertifikat", preset: "certificate", path: "", audience: "Mandiri", level: "", status: "Draft", time: "" },
];
function safePath(value: string) {
  if (!value || value !== value.trim()) return false;
  let decoded = value;
  try {
    for (let index = 0; index < 4 && decoded.includes("%"); index++) decoded = decodeURIComponent(decoded);
  } catch { return false; }
  return decoded.startsWith("/") && !decoded.includes("//") && !/[\\\s\u0000-\u001f\u007f:%]/.test(decoded);
}
function destination(item: Notification) {
  const path = item.preset === "custom" ? item.path : destinations[item.preset];
  return path && safePath(path) ? path : "";
}
function NotificationPreview({ item }: { item: Notification }) {
  const Icon = item.preset === "schedule" ? LuCalendar : item.preset === "replay" ? LuRotateCcw : item.type === "Belajar" ? LuBookOpen : item.type === "Achievement" ? LuAward : item.type === "Akun" ? LuClock : LuBell;
  const path = destination(item);
  const time = item.time && Number.isFinite(Date.parse(item.time)) ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(item.time)) : "";
  return <div className="notification-page" aria-label="Pratinjau notifikasi siswa"><section className="notification-group"><article className="unread">
    <span className="notification-icon" aria-hidden="true"><Icon /></span><div><small>{item.type}{time && ` • ${time} WIB`}</small><h2>{item.title}</h2><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.body}</p></div>
    {item.ctaLabel && (path ? <a href={path} onClick={(event) => event.preventDefault()} aria-label={`${item.ctaLabel} (pratinjau, tanpa navigasi)`}>{item.ctaLabel}</a> : <span className="notification-locked" aria-disabled="true">{item.ctaLabel}</span>)}
  </article></section></div>;
}

export function AdminNotificationPrototype() {
  const [rows, setRows] = useState<Notification[]>(() => fixtures.map((item) => ({ ...item })));
  const [draft, setDraft] = useState<Notification | null>(null);
  const [view, setView] = useState<Notification | null>(null);
  const [deleting, setDeleting] = useState<Notification | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [audience, setAudience] = useState("");
  const [status, setStatus] = useState("");
  const [level, setLevel] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const query = search.trim().toLowerCase();
  const visible = rows.filter((row) => (!type || type === row.type) && (!audience || audience === row.audience) && (!status || status === row.status) && (!level || level === row.level) && [row.title, row.body, row.ctaLabel].some((text) => text.toLowerCase().includes(query)));
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.title.trim() || !draft.body.trim()) { setError("Judul dan isi notifikasi wajib diisi."); return; }
    if (!types.includes(draft.type) || !audiences.includes(draft.audience) || (draft.level && !levels.includes(draft.level)) || !["Draft", "Published"].includes(draft.status) || !Object.hasOwn(destinations, draft.preset)) { setError("Pilihan notifikasi tidak valid."); return; }
    if (draft.preset !== "None" && (!draft.ctaLabel.trim() || !destination(draft))) { setError("Isi label CTA dan pilih tujuan internal yang valid. Custom harus berupa path relatif berawalan /, tanpa //, skema, backslash, atau spasi."); return; }
    if (draft.preset === "None" && draft.ctaLabel.trim()) { setError("Pilih tujuan CTA atau kosongkan label CTA."); return; }
    if (draft.time && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(draft.time) || !Number.isFinite(Date.parse(draft.time)))) { setError("Waktu harus berupa timestamp ISO dengan zona waktu, misalnya format YYYY-MM-DDTHH:mm:ss+07:00."); return; }
    const next: Notification = { ...draft, title: draft.title.trim(), body: draft.body.trim(), ctaLabel: draft.ctaLabel.trim(), path: draft.preset === "custom" ? draft.path : "", time: draft.time ? new Date(draft.time).toISOString() : "" };
    setRows((current) => current.some((row) => row.id === next.id) ? current.map((row) => row.id === next.id ? next : row) : [...current, next]);
    setDraft(null); setError(""); setMessage("Notifikasi disimpan untuk sesi ini. Tidak dikirim ke siswa.");
  }
  function remove() {
    if (!deleting) return;
    setRows((current) => current.filter((row) => row.id !== deleting.id));
    if (view?.id === deleting.id) setView(null);
    setDeleting(null); setMessage("Notifikasi dihapus dari sesi ini.");
  }
  return <AdminShell current="/admin/notifikasi"><main className="admin-public-prototype">
    <AdminPageHeader title="Notifikasi" actions={<button type="button" className="button button-primary" onClick={() => { setError(""); setDraft({ id: crypto.randomUUID(), type: "Pengumuman", title: "", body: "", ctaLabel: "", preset: "None", path: "", audience: "All", level: "", status: "Draft", time: "" }); }}>Tambah Notifikasi</button>} />
    <p>Konten dan status hanya berlaku selama sesi ini. Published tidak mengirim notifikasi. Waktu opsional hanya metadata, bukan jadwal pengiriman. OPEN: copy Admin final, aturan audience/level dan waktu produksi.</p><p role="status">{message}</p>
    <AdminSection title="Notifikasi"><AdminFilterToolbar>
      <label className="admin-field">Tipe<select value={type} onChange={(event) => setType(event.target.value)}><option value="">Semua</option>{types.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">Audience<select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="">Semua</option>{audiences.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">Level<select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">Semua</option>{levels.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua</option><option>Draft</option><option>Published</option></select></label>
      <label className="admin-prototype-search"><input type="search" aria-label="Cari notifikasi" value={search} onChange={(event) => setSearch(event.target.value)} /><span aria-hidden="true"><LuSearch /></span></label>
    </AdminFilterToolbar><AdminDataTable caption="Daftar Notifikasi" rows={visible} rowKey={(row) => row.id} columns={[
      { key: "type", header: "Tipe", cell: (row) => row.type }, { key: "title", header: "Judul", cell: (row) => row.title }, { key: "body", header: "Isi", cell: (row) => row.body }, { key: "cta", header: "CTA", cell: (row) => row.ctaLabel ? `${row.ctaLabel} • ${destination(row)}` : "—" }, { key: "audience", header: "Audience", cell: (row) => row.audience }, { key: "level", header: "Level", cell: (row) => row.level || "—" }, { key: "time", header: "Waktu", cell: (row) => row.time || "—" }, { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.status} /> },
    ]} actions={{ cell: (row) => <div className="admin-page-actions">
      <button type="button" className="button" aria-label={`Lihat ${row.title}`} onClick={() => setView(row)}>Lihat</button><button type="button" className="button" aria-label={`Edit ${row.title}`} onClick={() => { setError(""); setDraft({ ...row }); }}>Edit</button>
      <button type="button" className="button" aria-label={`${row.status === "Draft" ? "Publikasikan" : "Jadikan Draft"} ${row.title}`} onClick={() => { setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: item.status === "Draft" ? "Published" : "Draft" } : item)); setMessage("Status diubah untuk sesi ini. Tidak dikirim ke siswa."); }}>{row.status === "Draft" ? "Publikasikan" : "Jadikan Draft"}</button><button type="button" className="button" aria-label={`Hapus ${row.title}`} onClick={() => setDeleting(row)}>Hapus</button>
    </div> }} /></AdminSection>
    <AdminDialog open={Boolean(draft)} title={rows.some((row) => row.id === draft?.id) ? "Edit Notifikasi" : "Tambah Notifikasi"} close={closeEditor}>{draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
      <label className="admin-field">Tipe<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>{types.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">Judul<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label><label className="admin-field">Isi<textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} required /></label>
      <label className="admin-field">Tujuan CTA<select value={draft.preset} onChange={(event) => setDraft({ ...draft, preset: event.target.value, path: "", ctaLabel: event.target.value === "None" ? "" : draft.ctaLabel })}>{Object.keys(destinations).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">Label CTA<input value={draft.ctaLabel} disabled={draft.preset === "None"} onChange={(event) => setDraft({ ...draft, ctaLabel: event.target.value })} required={draft.preset !== "None"} /></label>
      {draft.preset === "custom" ? <label className="admin-field">Path relatif<input value={draft.path} onChange={(event) => setDraft({ ...draft, path: event.target.value })} required /><small>Hanya path internal berawalan /. Tanpa //, skema, backslash, atau spasi.</small></label> : draft.preset !== "None" && <p>Tujuan: {destination(draft)}</p>}
      <label className="admin-field">Audience<select value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value })}>{audiences.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">Level (opsional)<select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}><option value="">Semua</option>{levels.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Draft</option><option>Published</option></select></label>
      <label className="admin-field">Waktu (opsional)<input value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /><small>Timestamp ISO dengan zona waktu. Ditampilkan dalam Asia/Jakarta; tidak menjalankan pengiriman.</small></label>
      <NotificationPreview item={draft} />{error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary">Simpan Notifikasi</button></div>
    </form>}</AdminDialog>
    <AdminDialog open={Boolean(view)} title="Detail Notifikasi" close={closeView}>{view && <NotificationPreview item={view} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Notifikasi?" close={closeDelete} actions={<><button type="button" className="button" onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" onClick={remove}>Hapus Notifikasi</button></>}><p>Hapus notifikasi {deleting?.title} dari sesi ini? Notifikasi siswa tidak berubah.</p></AdminDialog>
  </main></AdminShell>;
}
