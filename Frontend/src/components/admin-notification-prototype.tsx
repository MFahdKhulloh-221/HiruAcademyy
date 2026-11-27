"use client";

import { useCallback, useRef, useState } from "react";
import { useSystemAdminRows } from "@/components/system-admin-hooks";
import { useLearningRequest } from "@/components/learning-hooks";
import { adminLearningContext } from "@/lib/admin-learning-api";
import { programSlug } from "@/lib/learning-api";
import type { SystemNotification } from "@/lib/schedule-replay-api";
import { LuAward, LuBookOpen, LuCalendar, LuMegaphone, LuUser } from "react-icons/lu";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import menuStyles from "./admin-showcase.module.css";
import styles from "./admin-notification.module.css";

type Notification = { id: string; type: string; title: string; body: string; ctaLabel: string; preset: string; path: string; audience: string; level: string; status: string; time: string };
const categories = [{ value: "Pengumuman", label: "Pengumuman", icon: LuMegaphone }, { value: "Belajar", label: "Pembelajaran", icon: LuBookOpen }, { value: "Kelas", label: "Kelas", icon: LuCalendar }, { value: "Achievement", label: "Pencapaian", icon: LuAward }, { value: "Akun", label: "Akun", icon: LuUser }];
const recipients = [{ value: "All", label: "Semua siswa", description: "Seluruh pengguna yang memiliki akun siswa." }, { value: "Free", label: "Member Gratis", description: "Siswa yang menggunakan akses gratis." }, { value: "Mandiri", label: "Belajar Mandiri", description: "Siswa dengan paket pembelajaran mandiri." }, { value: "Sensei", label: "Belajar dengan Sensei", description: "Siswa dengan paket kelas bersama Sensei." }];
const destinations = [{ value: "None", label: "Tanpa tombol", button: "", path: "" }, { value: "journey", label: "Perjalanan Belajar", button: "Mulai Belajar", path: "/journey" }, { value: "chapter", label: "Chapter tertentu", button: "Buka Chapter", path: "" }, { value: "schedule", label: "Jadwal Kelas", button: "Lihat Jadwal", path: "/schedule" }, { value: "replay", label: "Replay Kelas", button: "Tonton Replay", path: "/replay" }, { value: "tryout", label: "Try Out", button: "Lihat Try Out", path: "/tryout" }, { value: "certificate", label: "Sertifikat", button: "Lihat Sertifikat", path: "/certificate" }, { value: "invoice", label: "Tagihan & Pembayaran", button: "Lihat Tagihan", path: "/invoice" }];
const decodeNotification = (row: SystemNotification): Notification => ({ id: String(row.id), type: row.type, title: row.title, body: row.body, ctaLabel: row.cta_label || "", preset: row.preset, path: row.path || "", audience: row.audience, level: row.level?.toUpperCase() || "", status: row.status, time: row.time || "" });
const encodeNotification = (row: Notification) => ({ type: row.type, title: row.title.trim(), body: row.body.trim(), cta_label: row.ctaLabel || null, preset: row.preset === "journey" ? "custom" : row.preset, path: row.path || null, audience: row.audience, level: row.level.toLowerCase() || null, status: row.status });
const recipient = (item: Notification) => `${recipients.find(value => value.value === item.audience)?.label || "Penerima sebelumnya"}${item.level ? ` — khusus siswa ${item.level}` : ""}`;
const destinationName = (item: Notification) => item.preset === "custom" ? item.path === "/journey" ? "Perjalanan Belajar" : "Halaman tujuan sebelumnya" : destinations.find(value => value.value === item.preset)?.label || "Halaman tujuan sebelumnya";
const publicationTime = (time: string) => time && Number.isFinite(Date.parse(time)) ? `${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(time))} WIB` : "Belum diterbitkan";

function NotificationPreview({ item, live = false }: { item: Notification; live?: boolean }) {
  const category = categories.find(value => value.value === item.type) || categories[0];
  const Icon = category.icon;
  return <article className={styles.preview} aria-label="Pratinjau notifikasi siswa"><span className={styles.icon} aria-hidden="true"><Icon /></span><div><small>{category.label} · {live ? "Baru saja" : publicationTime(item.time)}</small><h3>{item.title || "Judul notifikasi"}</h3><p>{item.body || "Isi pesan akan tampil di sini."}</p>{item.ctaLabel && item.path && <button type="button" className="button button-primary" aria-disabled="true" onClick={event => event.preventDefault()}>{item.ctaLabel} <span aria-hidden="true">→</span></button>}</div><span className={styles.dot} aria-label="Belum dibaca" /></article>;
}

export function AdminNotificationPrototype() {
  const store = useSystemAdminRows("notifications", decodeNotification, encodeNotification);
  const loadCatalog = useCallback((signal: AbortSignal) => adminLearningContext(signal), []);
  const catalog = useLearningRequest(loadCatalog, "notification-chapters");
  const [draft, setDraft] = useState<Notification | null>(null);
  const [view, setView] = useState<Notification | null>(null);
  const [deleting, setDeleting] = useState<Notification | null>(null);
  const [confirm, setConfirm] = useState<Notification | null>(null);
  const [success, setSuccess] = useState<Notification | null>(null);
  const [programId, setProgramId] = useState("");
  const [destinationChanged, setDestinationChanged] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [audience, setAudience] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const closeConfirm = useCallback(() => setConfirm(null), []);
  const closeSuccess = useCallback(() => setSuccess(null), []);
  const rows = store.rows;
  const query = search.trim().toLowerCase();
  const visible = rows.filter(row => (!type || type === row.type) && (!audience || audience === row.audience) && (!status || status === row.status) && [row.title, row.body].some(text => text.toLowerCase().includes(query)));
  const selectedProgram = catalog.data?.programs.find(program => String(program.id) === programId);
  const chapters = catalog.data?.chapters.filter(chapter => chapter.status === "published" && String(chapter.program_id) === programId).sort((a, b) => a.chapter_number - b.chapter_number) || [];
  function describeDestination(item: Notification) {
    for (const chapter of catalog.data?.chapters || []) {
      const program = catalog.data?.programs.find(value => value.id === chapter.program_id);
      if (program && item.path === `/learn/${programSlug(program.code)}/chapter-${chapter.chapter_number}`) return `${program.name} · Chapter ${chapter.chapter_number} — ${chapter.title}`;
    }
    return destinationName(item);
  }
  function edit(item?: Notification) {
    setError(""); setMessage(""); setProgramId(""); setDestinationChanged(false);
    setDraft(item ? { ...item } : { id: crypto.randomUUID(), type: "Pengumuman", title: "", body: "", ctaLabel: "", preset: "None", path: "", audience: "All", level: "", status: "draft", time: "" });
  }
  function validate(item: Notification) {
    if (!item.title.trim() || !item.body.trim()) return "Judul dan isi pesan wajib diisi.";
    if (item.title.trim().length > 255) return "Judul maksimal 255 karakter.";
    if (destinationChanged && item.preset === "chapter" && (!selectedProgram || !chapters.some(chapter => item.path === `/learn/${programSlug(selectedProgram.code)}/chapter-${chapter.chapter_number}`))) return "Pilih program dan chapter yang sudah terbit.";
    if (item.preset !== "None" && (!item.path || !item.ctaLabel)) return "Pilih halaman tujuan yang tersedia.";
    return "";
  }
  async function persist(item: Notification) {
    if (saving.current || store.busy || store.loading) return;
    saving.current = true;
    try {
      if (!await store.save(item)) { setError("Notifikasi belum berhasil disimpan. Periksa isian dan coba lagi."); return; }
      setConfirm(null); setDraft(null); setError("");
      if (item.status === "published") setSuccess(item); else setMessage("Notifikasi berhasil disimpan sebagai draf.");
    } finally { saving.current = false; }
  }
  function prepare(status: string) {
    if (!draft) return;
    const invalid = validate(draft);
    setError(invalid);
    if (invalid) return;
    const next = { ...draft, status };
    if (status === "published") setConfirm(next); else void persist(next);
  }
  async function remove() {
    if (!deleting || !await store.remove(deleting.id)) return;
    setDeleting(null); setMessage("Notifikasi dihapus.");
  }
  return <AdminShell current="/admin/notifikasi"><main className="admin-public-prototype">
    <AdminPageHeader title="Notifikasi" description="Kelola pesan dan pengumuman untuk siswa." actions={<button type="button" className="button button-primary" onClick={() => edit()}>+ Buat Notifikasi</button>} />
    <div className={styles.summary}>{[["Total Notifikasi", rows.length], ["Terbit", rows.filter(row => row.status === "published").length], ["Draf", rows.filter(row => row.status === "draft").length]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{store.loading && !store.data ? "—" : count}</strong></div>)}</div>
    <p role="status">{message}</p>{(store.error || store.mutationError) && <p role="alert">Notifikasi belum berhasil dimuat atau disimpan. Silakan coba lagi.</p>}{store.error && <button type="button" className="button" onClick={store.retry}>Coba Lagi</button>}
    <AdminSection title="Daftar Notifikasi"><AdminFilterToolbar>
      <label className="admin-field">Cari notifikasi<input type="search" placeholder="Cari judul atau isi pesan" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="admin-field">Kategori<select value={type} onChange={event => setType(event.target.value)}><option value="">Semua kategori</option>{categories.map(value => <option key={value.value} value={value.value}>{value.label}</option>)}</select></label>
      <label className="admin-field">Penerima<select value={audience} onChange={event => setAudience(event.target.value)}><option value="">Semua penerima</option>{recipients.map(value => <option key={value.value} value={value.value}>{value.label}</option>)}</select></label>
      <label className="admin-field">Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Semua status</option><option value="published">Terbit</option><option value="draft">Draf</option></select></label>
    </AdminFilterToolbar><AdminDataTable loading={store.loading && !store.data} caption="Daftar Notifikasi" rows={visible} rowKey={row => row.id} columns={[
      { key: "notification", header: "Notifikasi", cell: row => <div className={styles.title}><strong>{row.title}</strong><small>{categories.find(value => value.value === row.type)?.label || "Pengumuman"}</small></div> },
      { key: "recipient", header: "Penerima", cell: recipient },
      { key: "status", header: "Status", cell: row => <AdminStatusBadge status={row.status === "published" ? "Terbit" : "Draf"} /> },
    ]} actions={{ header: "Aksi", cell: row => <><button type="button" className={`button ${menuStyles.trigger}`} popoverTarget={`notification-actions-${row.id}`} aria-label={`Tindakan ${row.title}`} onClick={event => { const box = event.currentTarget.getBoundingClientRect(); const menu = document.getElementById(`notification-actions-${row.id}`); menu?.style.setProperty("top", `${Math.max(8, Math.min(box.bottom + 4, window.innerHeight - 280))}px`); menu?.style.setProperty("left", `${Math.max(8, Math.min(box.right - 200, window.innerWidth - 208))}px`); }}>•••</button><div id={`notification-actions-${row.id}`} popover="auto" className={menuStyles.actionMenu} onClick={event => { if ((event.target as HTMLElement).closest("button:not(:disabled)")) event.currentTarget.hidePopover(); }}><button type="button" className="button" onClick={() => setView(row)}>Lihat Detail</button><button type="button" className="button" onClick={() => edit(row)}>Edit</button><button type="button" className="button" disabled={store.busy || store.loading} onClick={() => { setError(""); if (row.status === "draft") setConfirm({ ...row, status: "published" }); else void persist({ ...row, status: "draft" }); }}>{row.status === "draft" ? "Terbitkan" : "Jadikan Draf"}</button><button type="button" className="button" onClick={() => setDeleting(row)}>Hapus</button></div></> }} /></AdminSection>
    <AdminDialog open={Boolean(draft)} title={rows.some(row => row.id === draft?.id) ? "Edit Notifikasi" : "Buat Notifikasi"} close={closeEditor}>{draft && <form className={styles.editor} onSubmit={event => { event.preventDefault(); prepare("published"); }} noValidate>
      <fieldset><legend>Isi Pesan</legend><label className="admin-field">Kategori notifikasi<select value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })}>{categories.map(value => <option key={value.value} value={value.value}>{value.label}</option>)}</select></label><label className="admin-field">Judul notifikasi<input maxLength={255} placeholder="Contoh: Materi Chapter 2 sudah tersedia" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} required /></label><label className="admin-field">Isi pesan<textarea rows={5} placeholder="Tuliskan informasi yang ingin disampaikan kepada siswa." value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} required /></label></fieldset>
      <fieldset><legend>Siapa yang menerima?</legend><div className={styles.recipients}>{recipients.map(value => <label key={value.value}><input type="radio" name="notification-recipient" value={value.value} checked={draft.audience === value.value} onChange={() => setDraft({ ...draft, audience: value.value })} /><span><strong>{value.label}</strong><small>{value.description}</small></span></label>)}</div>{draft.level && <p className={styles.notice}>Khusus siswa {draft.level}. Batas penerima sebelumnya tetap dipertahankan.</p>}</fieldset>
      <fieldset><legend>Arahkan siswa ke halaman</legend><p>Pilih halaman yang perlu dibuka siswa setelah membaca notifikasi.</p><label className="admin-field">Halaman tujuan<select value={!destinationChanged && rows.some(row => row.id === draft.id) ? "previous" : draft.preset} onChange={event => { const choice = destinations.find(value => value.value === event.target.value); if (!choice) return; setDestinationChanged(true); setProgramId(""); setDraft({ ...draft, preset: choice.value, path: choice.path, ctaLabel: choice.button }); }}>{!destinationChanged && rows.some(row => row.id === draft.id) && <option value="previous">{describeDestination(draft)} — tetap gunakan</option>}{destinations.map(value => <option key={value.value} value={value.value}>{value.label}</option>)}</select></label>
      {draft.preset === "chapter" && destinationChanged && <><label className="admin-field">Program<select value={programId} disabled={catalog.loading} onChange={event => { setProgramId(event.target.value); setDraft({ ...draft, path: "" }); }}><option value="">Pilih program</option>{catalog.data?.programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label><label className="admin-field">Chapter<select value={draft.path} disabled={!selectedProgram || catalog.loading} onChange={event => setDraft({ ...draft, path: event.target.value })}><option value="">Pilih chapter</option>{selectedProgram && chapters.map(chapter => <option key={chapter.id} value={`/learn/${programSlug(selectedProgram.code)}/chapter-${chapter.chapter_number}`}>Chapter {chapter.chapter_number} — {chapter.title}</option>)}</select></label>{catalog.error && <p role="alert">Daftar program dan chapter belum dapat dimuat. <button type="button" className="button" onClick={catalog.retry}>Coba lagi</button></p>}{selectedProgram && !catalog.loading && !catalog.error && !chapters.length && <p>Belum ada chapter terbit pada program ini.</p>}<p>Pilihan chapter tidak mengubah penerima atau hak akses materi siswa.</p></>}
      </fieldset><section><h3>Pratinjau siswa</h3><NotificationPreview item={draft} live /></section>{error && <p role="alert">{error}</p>}<div className={styles.actions}><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="button" className="button button-secondary" disabled={store.busy || store.loading} onClick={() => prepare("draft")}>Simpan Draf</button><button type="submit" className="button button-primary" disabled={store.busy || store.loading}>Kirim Notifikasi</button></div>
    </form>}</AdminDialog>
    <AdminDialog open={Boolean(confirm)} title="Kirim notifikasi sekarang?" close={closeConfirm} actions={<><button type="button" className="button" disabled={store.busy} onClick={closeConfirm}>Kembali dan Edit</button><button type="button" className="button button-primary" disabled={store.busy || store.loading} onClick={() => confirm && void persist(confirm)}>Ya, Kirim Sekarang</button></>}>{confirm && <><p>Pastikan pesan dan penerimanya sudah sesuai.</p><dl className={styles.details}><dt>Judul notifikasi</dt><dd>{confirm.title}</dd><dt>Penerima</dt><dd>{recipient(confirm)}</dd><dt>Halaman tujuan</dt><dd>{describeDestination(confirm)}</dd></dl>{(error || store.mutationError) && <p role="alert">Notifikasi belum berhasil diterbitkan. Periksa isian dan coba lagi.</p>}</>}</AdminDialog>
    <AdminDialog open={Boolean(success)} title="Notifikasi berhasil diterbitkan." close={closeSuccess} actions={<><button type="button" className="button" onClick={closeSuccess}>Kembali ke daftar notifikasi</button><button type="button" className="button button-primary" onClick={() => { setView(success); setSuccess(null); }}>Lihat pratinjau siswa</button></>}><p>Pesanmu kini dapat dilihat oleh siswa yang sesuai dengan pilihan penerima.</p></AdminDialog>
    <AdminDialog open={Boolean(view)} title="Detail Notifikasi" close={closeView}>{view && <><NotificationPreview item={view} /><dl className={styles.details}><dt>Penerima</dt><dd>{recipient(view)}</dd><dt>Status</dt><dd>{view.status === "published" ? "Terbit" : "Draf"}</dd><dt>Halaman tujuan</dt><dd>{describeDestination(view)}</dd><dt>Waktu publikasi</dt><dd>{view.status === "published" && !view.time ? "Waktu publikasi tersedia setelah daftar diperbarui." : publicationTime(view.time)}</dd></dl></>}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Notifikasi?" close={closeDelete} actions={<><button type="button" className="button" disabled={store.busy} onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" disabled={store.busy} onClick={() => void remove()}>Hapus Notifikasi</button></>}><p>Hapus notifikasi {deleting?.title}? Notifikasi ini tidak lagi tampil pada siswa.</p>{store.mutationError && <p role="alert">Notifikasi belum berhasil dihapus. Silakan coba lagi.</p>}</AdminDialog>
  </main></AdminShell>;
}
