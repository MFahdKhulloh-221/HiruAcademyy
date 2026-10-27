"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AdminDialog, AdminPageHeader, AdminShell } from "@/components/admin-primitives";
import { StudentAvatar } from "@/components/student-avatar";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { TestimonialCard } from "@/components/testimonial-card";
import { VideoRecommendation } from "@/app/testimoni/video-recommendation";
import { TestimonialFields, TestimonialPreview } from "@/components/testimonial-builder";
import { apiRequest } from "@/lib/api";
import { contentMedia, useContent, type TestimonialContent } from "@/lib/public-content-api";
import styles from "./admin-testimonial.module.css";

type Item = TestimonialContent & { source?: string; user_id?: number | null; consent_public?: boolean; moderation_status?: string; archived_at?: string | null };
const empty: Item = { id: 0, type: "text", name: "", context: "", quote: "", image: null, title: "", video_title: "", video_url: "", video_thumbnail: "", show_on_testimonials: false, published: false, landing: false, archived_at: null };
function landingEligible(item: Item) { return item.type === "text" && !item.video_url; }
function isPublic(item: Item) {
  return item.consent_public === true && item.moderation_status === "approved" && !!item.published && !item.archived_at && !!(item.landing || item.show_on_testimonials);
}
function publicationLabel(item: Item) {
  if (item.archived_at) return "Diarsipkan Admin";
  if (item.consent_public !== true) return "Menunggu izin publikasi siswa";
  if (isPublic(item)) return [item.show_on_testimonials && "/testimoni", item.landing && "Landing"].filter(Boolean).join(" / ");
  return item.moderation_status !== "approved" ? "Belum disetujui / perlu perbaikan" : "Non-publik / draft";
}
export function AdminTestimonialPrototype() {
  const content = useContent<Item>("/api/admin/testimonials");
  const [draft, setDraft] = useState<Item | null>(null);
  const [view, setView] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [filter, setFilter] = useState("publish");
  const [order, setOrder] = useState("newest");
  const [kind, setKind] = useState("all");
  const [landingOnly, setLandingOnly] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  useEffect(() => { list.current?.scrollTo({ top: 0 }); }, [filter, kind, landingOnly, search, order]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const selected = content.data.filter(item => isPublic(item) && item.landing && landingEligible(item)).sort((a, b) => (a.sort_order ?? 1) - (b.sort_order ?? 1) || a.id - b.id);
  const overLimit = selected.length > 6;
  const rows = content.data.filter(item => {
    return (filter === "publish" ? isPublic(item) : !isPublic(item)) && (kind === "all" || (item.type || (item.video_url ? "video" : "text")) === kind) && (!landingOnly || (isPublic(item) && item.landing)) && `${item.name} ${item.quote} ${item.title || ""}`.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id"));
  }).sort((a, b) => {
    const difference = (Date.parse(a.created_at || "") || 0) - (Date.parse(b.created_at || "") || 0) || a.id - b.id;
    return order === "newest" ? -difference : difference;
  });
  async function mutate(item: Item, body?: object, remove = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await apiRequest(`/api/admin/testimonials${item.id ? `/${item.id}` : ""}`, { method: remove ? "DELETE" : item.id ? "PATCH" : "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
      content.reload(); setDraft(null); setDeleting(null); setMessage(remove ? "Testimoni dihapus." : "Testimoni disimpan.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan gagal."); }
    finally { lock.current = false; setBusy(false); }
  }
  function toggleLanding(item: Item, checked: boolean) {
    if (checked && !landingEligible(item)) { setError("Landing hanya untuk testimoni teks."); return; }
    if (checked && selected.length >= 6) { setError("Maksimal 6 testimoni Landing. Hapus salah satu pilihan terlebih dahulu."); return; }
    void mutate(item, { landing: checked });
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const media = draft.type === "video" ? { title: draft.title, video_url: draft.video_url, video_thumbnail: draft.video_thumbnail } : {};
    const body = { quote: draft.quote, ...media, archived_at: draft.archived_at || null, published: !!draft.published, landing: !!draft.landing, show_on_testimonials: draft.show_on_testimonials };
    void mutate(draft, draft.source === "student" ? { ...body, ...(draft.consent_public === true && draft.published ? { moderation_status: "approved" } : {}) } : { ...body, type: draft.type, name: draft.name, context: draft.context, image: draft.image || null, ...(draft.type === "text" ? { title: null, video_title: null, video_url: null, video_thumbnail: null } : {}) });
  }
  function edit(item: Item) { setError(""); setDraft({ ...item }); }
  return <AdminShell current="/admin/testimoni"><main className={styles.page}>
    <AdminPageHeader title="Kelola Testimoni" description={`${content.data.length} testimoni tersimpan`} actions={<button className="button button-primary" onClick={() => edit(empty)}>Tambah Testimoni</button>} />
    <section className={styles.landing} aria-label="Testimoni Pilihan Landing Page"><h2>Testimoni Pilihan Landing Page</h2><p>Maksimal 6 testimoni teks. Video hanya tampil di halaman /testimoni.</p>{overLimit ? <p role="alert">Perlu penyesuaian: {selected.length} dipilih, maksimal 6. Lepas pilihan sampai tersisa maksimal enam. Penambahan dan pengurutan dinonaktifkan sementara.</p> : <p>{selected.length} dari 6 testimoni dipilih</p>}
      {!selected.length && <p>Belum ada pilihan Landing.</p>}
      <ol className={overLimit ? styles.reconcile : undefined} tabIndex={overLimit ? 0 : undefined} aria-label={overLimit ? "Penyesuaian pilihan Landing" : undefined}>{selected.map((item, index) => <li key={item.id} className={styles.landingItem}>
        <span aria-label={`Urutan ${index + 1}`}>{index + 1}.</span><div className={styles.owner}><StudentAvatar name={item.name} url={contentMedia(item.image, item.image_resolved_url)} className={styles.avatar} /><div><strong>{item.name}</strong><p>{item.context}</p></div></div><p className={styles.quote}>{item.title || item.quote}</p>
        <div className={styles.actions}><button className="button" aria-label={`Naik ${item.name}`} disabled={busy || overLimit || index === 0} onClick={() => void mutate(item, { landing_position: index })}>Naik</button><button className="button" aria-label={`Turun ${item.name}`} disabled={busy || overLimit || index === selected.length - 1} onClick={() => void mutate(item, { landing_position: index + 2 })}>Turun</button><button className="button" disabled={busy} onClick={() => toggleLanding(item, false)}>Hapus dari Landing</button></div>
      </li>)}</ol>
    </section>
    <div className={styles.toolbar} aria-label="Filter testimoni">
      <div className={styles.toolbarTop}>
        <div className={styles.statusFilter} role="group" aria-label="Status testimoni">{[["publish", "Publish"], ["archive", "Arsip"]].map(([key, label]) => <button className="button" key={key} aria-pressed={key === filter} onClick={() => setFilter(key)}>{label}</button>)}</div>
        <label className={styles.searchFilter}>Cari testimoni<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nama atau isi testimoni" /></label>
      </div>
      <div className={styles.toolbarBottom}>
        <label>Jenis testimoni<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">Semua Jenis</option><option value="text">Testimoni Teks</option><option value="video">Testimoni Video</option></select></label>
        <label>Urutkan<select value={order} onChange={event => setOrder(event.target.value)}><option value="newest">Terbaru dahulu</option><option value="oldest">Terlama dahulu</option></select></label>
        <label className={styles.landingToggle}><input type="checkbox" checked={landingOnly} onChange={event => setLandingOnly(event.target.checked)} />Hanya Pilihan Landing</label>
        <button className="button" onClick={() => { setFilter("publish"); setKind("all"); setOrder("newest"); setLandingOnly(false); setSearch(""); }}>Reset Filter</button>
      </div>
    </div>
    {content.error && <p role="alert">{content.error} <button onClick={content.reload}>Coba lagi</button></p>}{message && <p role="status">{message}</p>}{error && !draft && !deleting && <p role="alert">{error}</p>}
    {content.loading && <p role="status">Memuat testimoni…</p>}
    <p role="status">{rows.length} hasil filter</p>
    <div ref={list} className={styles.list} role="region" aria-label="Daftar testimoni" tabIndex={0}>{rows.map((item, index) => <article className={styles.item} key={item.id}>
      <div className={styles.owner}><span aria-label={`Nomor ${index + 1}`}>{index + 1}.</span><StudentAvatar name={item.name} url={contentMedia(item.image, item.image_resolved_url)} className={styles.avatar} /><div><h2>{item.name}</h2><p>{item.context}</p><small>{item.type === "video" ? "Video" : "Teks"}</small></div></div>
      <div className={styles.summary}><p className={styles.quote}>{item.title || item.quote}</p><p className={styles.status}>{item.type === "video" ? "Video" : "Teks"} / {publicationLabel(item)}</p>{item.archived_at && item.consent_public !== true && <p>Menunggu izin publikasi siswa</p>}</div>
      <div className={styles.actions}><label className={styles.landingToggle}><input type="checkbox" checked={!!item.landing && isPublic(item) && landingEligible(item)} disabled={busy || !isPublic(item) || !landingEligible(item) || (!item.landing && selected.length >= 6)} onChange={event => toggleLanding(item, event.target.checked)} />Tampilkan di Landing</label><button className="button" popoverTarget={`testimonial-actions-${item.id}`} aria-label={`Tindakan ${item.name}`} onClick={event => { const box = event.currentTarget.getBoundingClientRect(); const menu = document.getElementById(`testimonial-actions-${item.id}`); menu?.style.setProperty("top", `${Math.min(box.bottom + 4, window.innerHeight - 220)}px`); menu?.style.setProperty("left", `${Math.max(8, Math.min(box.right - 180, window.innerWidth - 188))}px`); }}>{"\u2022\u2022\u2022"}</button><div id={`testimonial-actions-${item.id}`} popover="auto" className={styles.actionMenu} onClick={event => { if ((event.target as HTMLElement).closest("button")) event.currentTarget.hidePopover(); }}><button className="button" onClick={() => setView(item)}>Lihat</button><button className="button" disabled={busy} onClick={() => edit(item)}>Edit</button>{isPublic(item) ? <button className="button" disabled={busy} onClick={() => void mutate(item, { archived_at: new Date().toISOString() })}>Arsipkan</button> : <button className="button" disabled={busy || item.consent_public !== true} title={item.consent_public !== true ? "Menunggu izin publikasi siswa" : undefined} onClick={() => edit({ ...item, archived_at: null, published: false, landing: false, show_on_testimonials: false })}>{item.archived_at ? "Pulihkan" : "Publish"}</button>}<button className="button" disabled={busy} onClick={() => { setError(""); setDeleting(item); }}>Hapus</button></div></div>
    </article>)}</div>{!content.loading && !rows.length && <p>Belum ada testimoni sesuai filter.</p>}
    <AdminDialog className={styles.builderDialog} open={!!draft} title={draft?.id ? "Edit Testimoni" : "Tambah Testimoni"} close={() => { if (!busy) setDraft(null); }}>{draft && <div className={styles.builder}><form onSubmit={save} className={styles.form}>
      <p>{draft.source === "student" ? "Identitas dan kepemilikan siswa tetap. Perubahan isi dilakukan oleh Admin." : "Konten kurasi Admin. Isi atribusi pemilik sebenarnya; jangan mengatasnamakan siswa tanpa dasar."}</p>
      <label>Nama / atribusi pemilik<input required value={draft.name} readOnly={draft.source === "student"} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>Program / konteks<input required value={draft.context} readOnly={draft.source === "student"} onChange={event => setDraft({ ...draft, context: event.target.value })} /></label>
      <TestimonialFields value={draft} lockType={!!draft.id} disabled={busy} thumbnailInput={<AdminMediaUpload kind="image" label="Thumbnail video" onUploaded={(video_thumbnail, url) => setDraft(previous => previous && ({ ...previous, video_thumbnail, video_thumbnail_resolved_url: url }))} />} onChange={patch => setDraft({ ...draft, ...patch })} />

      {!!draft.id && draft.consent_public !== true && <p>Menunggu izin publikasi siswa</p>}
      {draft.archived_at && <p>Arsip mengalahkan seluruh pilihan penayangan.</p>}
      <fieldset disabled={busy || !!draft.archived_at || (!!draft.id && draft.consent_public !== true)}><legend>Penayangan</legend>{!draft.id ? <label className={styles.check}><input type="checkbox" checked={!!draft.show_on_testimonials} onChange={event => setDraft({ ...draft, published: event.target.checked, show_on_testimonials: event.target.checked, landing: false })} />Tampilkan di halaman /testimoni</label> : ([['published', 'Aktifkan publikasi'], ['show_on_testimonials', 'Tampilkan di halaman /testimoni'], ['landing', 'Tampilkan di Landing Page (maksimal 6 testimoni teks)']] as const).map(([key, label]) => <label className={styles.check} key={key}><input type="checkbox" checked={!!draft[key]} disabled={key === "landing" && (!landingEligible(draft) || (!draft.landing && selected.length >= 6))} onChange={event => setDraft({ ...draft, [key]: event.target.checked })} />{label}</label>)}</fieldset>
      {error && <p role="alert">{error}</p>}<div className={styles.actions}><button className="button" type="button" disabled={busy} onClick={() => setDraft(null)}>Batal</button><button className="button button-primary" disabled={busy} type="submit">Simpan Testimoni</button></div>
    </form><TestimonialPreview value={draft} /></div>}</AdminDialog>
    <AdminDialog className={styles.detailDialog} open={!!view} title="Detail Testimoni" close={() => setView(null)}>{view && <div className={styles.dialogBody}><p className={styles.detailMeta}>{view.source === "student" ? "Kiriman siswa" : "Konten Admin"} / {publicationLabel(view)}</p>{view.type === "video" ? <VideoRecommendation item={view} /> : <TestimonialCard testimonial={view} />}</div>}</AdminDialog>
    <AdminDialog className={styles.deleteDialog} open={!!deleting} title="Hapus Testimoni?" close={() => { if (!busy) setDeleting(null); }} actions={<><button className="button" disabled={busy} onClick={() => setDeleting(null)}>Batal</button><button className="button button-primary" disabled={busy} onClick={() => deleting && void mutate(deleting, undefined, true)}>Hapus Testimoni</button></>}><div className={styles.dialogBody}><p>Hapus testimoni <strong>{deleting?.name}</strong>?</p><p className={styles.deleteNotice}>Penghapusan record bersifat permanen. Media tidak dihapus. Gunakan Arsip jika ingin menyimpan record.</p>{error && <p role="alert">{error}</p>}</div></AdminDialog>
  </main></AdminShell>;
}
