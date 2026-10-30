"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";
import { useEditorNavigation } from "./admin-editor-navigation";
import { useBlogRecovery } from "./admin-blog-recovery";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell, AdminDialog } from "@/components/admin-primitives";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { BlogThumbnail, type Article } from "@/components/admin-blog-preview";
import { AdminBlogCatalog, type BlogCatalogEntry } from "@/components/admin-blog-catalog";
import { BlogArticleBody } from "@/components/blog-article-body";
import { useAdminContent } from "@/lib/admin-content-api";
import styles from "./admin-blog-studio.module.css";
import "@/app/blog/editorial.css";
import { AdminBlogBlockEditor } from "./admin-blog-block-editor";
import { readEditableBody, validateEditableBody } from "@/lib/blog-block-editor";

const empty: Article = { id: "", title: "", slug: "", excerpt: "", body: "", thumbnail: "", category: "", author: "", seoTitle: "", metaDescription: "", featured: false, published: false, publishedAt: "" };
function status(article: Article) {
  return !article.published ? "Draft" : article.publishedAt && Date.parse(article.publishedAt) > Date.now() ? "Terjadwal" : "Terbit";
}
function date(value: string) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium" }).format(new Date(value)) : "—";
}
function options(entries: BlogCatalogEntry[], original: string) {
  return [...new Set([...entries.filter(entry => entry.active).map(entry => entry.name), ...(original ? [original] : [])])];
}
function uniqueSlug(title: string, rows: Article[]) {
  const base = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 240).replace(/-+$/, "");
  if (!base) return "";
  let slug = base;
  for (let suffix = 2; rows.some(article => article.slug === slug); suffix++) slug = `${base}-${suffix}`;
  return slug;
}

export function AdminBlogPrototype({ editorId }: { editorId?: string }) {
  const content = useAdminContent<Article>("blog-articles");
  const categories = useAdminContent<BlogCatalogEntry>("blog-categories");
  const authors = useAdminContent<BlogCatalogEntry>("blog-contributors");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Semua");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [settings, setSettings] = useState(false);
  const [preview, setPreview] = useState<Article | null>(null);
  const [deleting, setDeleting] = useState<Article | null>(null);
  const [message, setMessage] = useState("");
  const rows = [...content.rows].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0) || Number(b.id) - Number(a.id));
  const visible = rows.filter(article => article.title.toLocaleLowerCase("id-ID").includes(query.toLocaleLowerCase("id-ID")) && (filter === "Semua" || status(article) === filter) && (!category || article.category === category));
  const pages = Math.max(1, Math.ceil(visible.length / 12));
  const currentPage = Math.min(page, pages);
  const original = editorId === "new" ? { ...empty, id: "new" } : content.rows.find(article => article.id === editorId);
  return <AdminShell current="/admin/blog-seo"><main className={styles.studio}>
    {content.loadError && <p role="alert">{content.loadError} <button type="button" onClick={content.reload}>Coba lagi</button></p>}
    {editorId ? content.loading ? <p role="status">Memuat artikel…</p> : original ? <ArticleEditor key={editorId} original={original} rows={rows} categories={categories} authors={authors} content={content} /> : !content.loadError && <><h1>Artikel tidak ditemukan</h1><Link href="/admin/blog-seo">Kembali ke Artikel</Link></> : <>
      <header className={styles.header}><div><p className={styles.eyebrow}>HIRU CONTENT STUDIO</p><h1>Kelola Artikel</h1><p>Tulis, atur, dan terbitkan artikel HiruAcademy.</p></div><div className={styles.actions}><button type="button" className="button" onClick={() => setSettings(!settings)}>Pengaturan Blog</button><Link className="button button-primary" href="/admin/blog-seo/editor">+ Tulis Artikel</Link></div></header>
      <p role="status">{message}</p>
      {settings && <section className={styles.panel}><h2>Pengaturan Blog</h2><AdminBlogCatalog label="Kategori" catalog={categories} onChanged={content.reload} /><AdminBlogCatalog label="Kontributor" catalog={authors} onChanged={content.reload} /></section>}
      <section className={styles.panel} aria-label="Daftar artikel"><div className={styles.filters}><label>Cari judul artikel<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Cari judul artikel…" /></label><label htmlFor="studio-filter-category">Kategori<select id="studio-filter-category" aria-label="Kategori" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">Semua kategori</option>{[...new Set(rows.map(article => article.category))].map(name => <option key={name}>{name}</option>)}</select></label></div><div className={styles.tabs} aria-label="Status artikel">{["Semua", "Draft", "Terjadwal", "Terbit"].map(name => <button type="button" aria-pressed={filter === name} key={name} onClick={() => { setFilter(name); setPage(1); }}>{name}</button>)}</div>
      {content.loading && <p role="status">Memuat artikel…</p>}
      <div className={styles.tableWrap}><table><caption>Artikel · tanggal terbaru</caption><thead><tr><th scope="col">Artikel</th><th scope="col">Kategori / Penulis</th><th scope="col">Status</th><th scope="col">Tanggal terbit</th><th scope="col">Tindakan</th></tr></thead><tbody>{visible.slice((currentPage - 1) * 12, currentPage * 12).map(article => <tr key={article.id}><td><div className={styles.articleTitle}><div className={styles.thumb}><BlogThumbnail src={article.thumbnail} title={article.title} /></div><Link href={`/admin/blog-seo/editor?id=${article.id}`}>{article.title}</Link></div></td><td data-label="Kategori / Penulis">{article.category}<small>{article.author}</small></td><td data-label="Status"><span className={styles.badge}>{status(article)}</span></td><td data-label="Tanggal">{date(article.publishedAt)}</td><td data-label="Tindakan"><details className={styles.menu}><summary aria-label={`Tindakan ${article.title}`}>•••</summary><div><Link href={`/admin/blog-seo/editor?id=${article.id}`}>Edit</Link><button type="button" onClick={() => setPreview(article)}>Pratinjau</button>{status(article) === "Terbit" && <Link href={`/blog/${article.slug}`} target="_blank" rel="noopener noreferrer">Lihat di Website</Link>}<button type="button" onClick={() => setDeleting(article)}>Hapus</button></div></details></td></tr>)}</tbody></table></div>
      {!content.loading && !content.loadError && !visible.length && <p>Belum ada artikel yang sesuai.</p>}
      {pages > 1 && <nav className={styles.actions} aria-label="Halaman daftar artikel"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Sebelumnya</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Berikutnya</button></nav>}</section>
    </>}
    <AdminDialog open={Boolean(preview)} title="Pratinjau artikel tersimpan" close={() => setPreview(null)}>{preview && <article><p>{preview.category} · {preview.author} · {date(preview.publishedAt)}</p><h1>{preview.title}</h1><p>{preview.excerpt}</p><BlogArticleBody body={preview.body} /></article>}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus artikel?" close={() => { if (!content.busy) setDeleting(null); }} actions={<><button type="button" className="button" disabled={content.busy} onClick={() => setDeleting(null)}>Batal</button><button type="button" className="button button-primary" disabled={content.busy} onClick={async () => { if (!deleting) return; try { await content.mutate(deleting, true); setDeleting(null); setMessage("Artikel berhasil dihapus."); } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal menghapus artikel."); } }}>Hapus artikel</button></>}><p>Hapus “{deleting?.title}”? Artikel akan dihapus dari penyimpanan dan tidak tersedia di website. Media tidak dihapus.</p></AdminDialog>
  </main></AdminShell>;
}

type Catalog = ReturnType<typeof useAdminContent<BlogCatalogEntry>>;
type Content = ReturnType<typeof useAdminContent<Article>>;
function ArticleEditor({ original, rows, categories, authors, content }: { original: Article; rows: Article[]; categories: Catalog; authors: Catalog; content: Content }) {
  const router = useRouter();
  const [draft, setDraft] = useState(original);
  const [baseline, setBaseline] = useState(JSON.stringify(original));
  const [saveState, setSaveState] = useState("Belum disimpan");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMobile, setPreviewMobile] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedule, setSchedule] = useState("");
  const dirty = JSON.stringify(draft) !== baseline;
  const { user } = useAuth();
  const navigation = useEditorNavigation();
  const recovery = useBlogRecovery(user?.id, original, draft, baseline, dirty);
  const isNew = original.id === "new";
  const editableBody = readEditableBody(original.body) !== null;
  const unavailable = categories.loading || authors.loading || Boolean(categories.loadError || authors.loadError);
  useEffect(() => {
    if (!dirty && !content.busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, content.busy]);
  const setNavigationGuard = navigation?.setGuard;
  useEffect(() => {
    setNavigationGuard?.({ dirty: dirty || Boolean(recovery.candidate), saving: content.busy, discard: recovery.clear });
    return () => setNavigationGuard?.(null);
  }, [dirty, content.busy, setNavigationGuard, recovery.clear, recovery.candidate]);
  function update<K extends keyof Article>(key: K, value: Article[K]) { setDraft(previous => ({ ...previous, [key]: value })); setSaveState("Belum disimpan"); }
  async function save(event: React.FormEvent<HTMLFormElement>, action: "save" | "publish" | "draft" | "schedule" = "save") {
    event.preventDefault();
    if (lock.current) return;
    setError("");
    if (unavailable) { setError("Kategori dan penulis belum tersedia. Muat ulang sebelum menyimpan."); return; }
    if (!draft.title.trim() || !draft.body.trim()) { setError("Judul dan isi artikel wajib diisi sesuai aturan penyimpanan saat ini."); return; }
    if (!options(categories.rows, original.category).includes(draft.category) || !options(authors.rows, original.author).includes(draft.author)) { setError("Pilih kategori dan penulis yang tersedia."); return; }
    if (draft.body !== original.body || isNew) { const problem = validateEditableBody(draft.body); if (problem) { setError(problem); return; } }
    const slug = isNew ? uniqueSlug(draft.title, rows) : original.slug;
    if (!slug) { setError("Judul memerlukan huruf Latin atau angka untuk membuat alamat artikel."); return; }
    if (action === "schedule" && (!schedule || !Number.isFinite(Date.parse(`${schedule}+07:00`)) || Date.parse(`${schedule}+07:00`) <= Date.now())) { setError("Pilih jadwal mendatang dalam waktu Asia/Jakarta."); return; }
    const next = { ...draft, slug,
      seoTitle: isNew && !draft.seoTitle ? draft.title : draft.seoTitle,
      metaDescription: isNew && !draft.metaDescription ? draft.excerpt : draft.metaDescription,
      ...(action === "publish" ? { published: true, publishedAt: new Date().toISOString() } : action === "draft" ? { published: false } : action === "schedule" ? { published: true, publishedAt: new Date(`${schedule}+07:00`).toISOString() } : {}),
    };
    lock.current = true; setSaveState("Menyimpan");
    try {
      await content.mutate(next);
      recovery.clear(); setDraft(next); setBaseline(JSON.stringify(next)); setSaveState("Tersimpan");
      if (isNew) router.push("/admin/blog-seo");
    } catch (cause) { setSaveState("Gagal menyimpan"); setError(cause instanceof Error ? cause.message : "Artikel gagal disimpan."); }
    finally { lock.current = false; }
  }
  return <form onSubmit={event => { const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value"); void save(event, action === "publish" || action === "draft" || action === "schedule" ? action : "save"); }} className={styles.editor} noValidate>
    <header className={styles.header}><div><Link href="/admin/blog-seo" onNavigate={event => { if (navigation) { event.preventDefault(); navigation.request(() => router.push("/admin/blog-seo")); } }}>← Kembali ke Artikel</Link><h1>{isNew ? "Tulis Artikel" : "Edit Artikel"}</h1></div><button type="submit" className="button button-primary" disabled={content.busy || unavailable || Boolean(recovery.candidate)}>{content.busy ? "Menyimpan…" : original.published ? "Simpan Perubahan" : "Simpan Draft"}</button></header>

    {showSchedule && <fieldset id="studio-schedule" className={styles.schedulePanel} disabled={content.busy || Boolean(recovery.candidate)}><legend>Jadwalkan untuk Nanti</legend><label>Tanggal dan waktu terbit<input type="datetime-local" required aria-required="true" value={schedule} onChange={event => setSchedule(event.target.value)} aria-describedby="studio-schedule-help" /></label><p id="studio-schedule-help">Artikel akan terbit otomatis sesuai jadwal yang dipilih. Waktu menggunakan WIB (Asia/Jakarta).</p><button type="submit" name="action" value="schedule" className="button" disabled={unavailable}>Jadwalkan Artikel</button></fieldset>}
    <AdminDialog open={previewOpen} className={styles.previewDialog} title="Pratinjau artikel" close={() => setPreviewOpen(false)}><div className={styles.previewControls}><p>Pratinjau tulisan saat ini. Tidak mengubah status publikasi.</p><div className={styles.actions}><button type="button" className="button" aria-pressed={!previewMobile} onClick={() => setPreviewMobile(false)}>Desktop</button><button type="button" className="button" aria-pressed={previewMobile} onClick={() => setPreviewMobile(true)}>Mobile</button></div></div><div className={`${styles.previewCanvas} ${previewMobile ? styles.previewMobile : ""}`}><div className="editorial-blog"><div className="editorial-container"><header className="editorial-article-header"><p className="kicker">{draft.category}</p><h1>{draft.title || "Judul artikel"}</h1>{draft.excerpt && <p className="editorial-deck">{draft.excerpt}</p>}<p className="editorial-byline">{draft.author}{draft.publishedAt && <> ? {date(draft.publishedAt)}</>}</p></header><article className="editorial-article"><div className="editorial-thumbnail"><BlogThumbnail key={draft.thumbnail} src={draft.thumbnail || "/brand/hiru-atas.png"} title={draft.title || "Artikel"} full /></div><BlogArticleBody body={draft.body} /></article></div></div></div></AdminDialog>
    {error && <p id="studio-save-error" role="alert">{error}</p>}
    {recovery.warning && <p role="alert">{recovery.warning}</p>}
    {recovery.candidate && <section aria-label="Pemulihan tulisan"><h2>Tulisan belum tersimpan ditemukan</h2><p>Snapshot sementara browser, bukan draft tersimpan di server. Pilih pulihkan atau abaikan sebelum mengedit.</p>{recovery.candidate.stale && <p role="alert">Artikel server sudah berbeda. URL, SEO, status publikasi, dan isi berformat lama dari server tetap dipertahankan.</p>}<button type="button" className="button" onClick={() => { const saved = recovery.candidate!.draft; setDraft({ ...original, title: saved.title, excerpt: saved.excerpt, body: editableBody && !recovery.candidate!.stale ? saved.body : original.body, category: saved.category, author: saved.author, thumbnail: saved.thumbnail ?? "", ...(!recovery.candidate!.stale ? { seoTitle: saved.seoTitle, metaDescription: saved.metaDescription } : {}) }); setSaveState("Belum disimpan"); recovery.clear(); }}>Pulihkan Tulisan</button><button type="button" className="button" onClick={recovery.clear}>Abaikan</button></section>}
    <fieldset aria-describedby={error ? "studio-save-error" : undefined} disabled={content.busy || Boolean(recovery.candidate)} className={styles.editorGrid}><section className={styles.panel}><label>Judul artikel <small>Wajib</small><input aria-label="Judul artikel" required maxLength={255} value={draft.title} onChange={event => update("title", event.target.value)} placeholder="Contoh: Cara Belajar Bahasa Jepang dari Nol" /></label><label>Ringkasan artikel <small>Opsional</small><textarea aria-label="Ringkasan artikel" rows={3} value={draft.excerpt} onChange={event => update("excerpt", event.target.value)} /><small>Tulis 1–2 kalimat yang menjelaskan isi artikel. Ringkasan ini tampil di daftar Blog.</small></label>
    <p className={styles.writingHint}>Judul, isi, kategori, dan penulis wajib diisi, termasuk saat menyimpan draft. Ringkasan dan gambar sampul boleh dikosongkan.</p><AdminBlogBlockEditor body={draft.body} onChange={body => update("body", body)} />
    <div className={styles.editorStatus}><span className={styles.badge}>{status(draft)}</span> <span role="status" aria-live="polite">{saveState === "Tersimpan" && dirty ? "Belum disimpan" : saveState}</span></div>
    <div className={styles.editorActions}><button type="button" className="button" title="Pratinjau Tulisan" aria-label="Pratinjau Tulisan" onClick={() => setPreviewOpen(true)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span className={styles.toolTip}>Pratinjau Tulisan</span></button><button type="submit" name="action" value="draft" className="button" disabled={content.busy || unavailable || Boolean(recovery.candidate)} title="Simpan sebagai Draft" aria-label="Simpan sebagai Draft"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 3h13l4 4v14H3V3h1Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></svg><span className={styles.toolTip}>Simpan sebagai Draft</span></button><button type="submit" name="action" value="publish" className="button" disabled={content.busy || unavailable || Boolean(recovery.candidate)} title="Terbitkan Sekarang" aria-label="Terbitkan Sekarang"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></svg><span className={styles.toolTip}>Terbitkan Sekarang</span></button>{draft.published && <button type="submit" name="action" value="draft" className="button" disabled={content.busy || Boolean(recovery.candidate)} title="Kembalikan ke Draft" aria-label="Kembalikan ke Draft"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12"/></svg><span className={styles.toolTip}>Kembalikan ke Draft</span></button>}<button type="button" className="button" title="Jadwalkan untuk Nanti" aria-label="Jadwalkan untuk Nanti" aria-expanded={showSchedule} aria-controls="studio-schedule" disabled={content.busy || Boolean(recovery.candidate)} onClick={() => setShowSchedule(!showSchedule)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M12 14v3l2 1"/></svg><span className={styles.toolTip}>Jadwalkan untuk Nanti</span></button></div>
    </section><aside className={styles.sidebar}><section className={styles.panel}><h2>Pengaturan artikel</h2><label htmlFor="studio-category">Kategori <small>Wajib</small><select id="studio-category" aria-label="Kategori" required disabled={unavailable} value={draft.category} onChange={event => update("category", event.target.value)}><option value="">Pilih kategori</option>{options(categories.rows, original.category).map(name => <option key={name}>{name}</option>)}</select></label><label htmlFor="studio-author">Penulis <small>Wajib</small><select id="studio-author" aria-label="Penulis" required disabled={unavailable} value={draft.author} onChange={event => update("author", event.target.value)}><option value="">Pilih penulis</option>{options(authors.rows, original.author).map(name => <option key={name}>{name}</option>)}</select></label>{categories.loadError && <p role="alert">{categories.loadError}<button type="button" onClick={categories.reload}>Muat ulang kategori</button></p>}{authors.loadError && <p role="alert">{authors.loadError}<button type="button" onClick={authors.reload}>Muat ulang penulis</button></p>}<details className={styles.googleSettings}><summary>Pengaturan Google (Opsional)</summary><p>Judul dan deskripsi untuk pencarian akan dibuat otomatis dari artikel. Bagian ini hanya perlu diubah jika Anda menginginkan tampilan berbeda.</p><label>Judul di Google (opsional)<input maxLength={255} value={draft.seoTitle} placeholder="Otomatis mengikuti judul artikel" onChange={event => update("seoTitle", event.target.value)} /></label><label>Deskripsi di Google (opsional)<textarea rows={3} value={draft.metaDescription} placeholder="Otomatis mengikuti ringkasan artikel" onChange={event => update("metaDescription", event.target.value)} /></label></details></section><section className={styles.panel}><h2>Gambar sampul <small>Opsional</small></h2><div className={styles.cover}><BlogThumbnail key={draft.thumbnail} src={draft.thumbnail} title={draft.title || "Artikel"} /></div><AdminMediaUpload buttonLabel={draft.thumbnail ? "Ganti Gambar" : "Unggah Gambar Sampul"} kind="image" label={draft.thumbnail ? "Ganti Gambar" : "Unggah Gambar Sampul"} onUploaded={thumbnail => update("thumbnail", thumbnail)} />{draft.thumbnail && <button type="button" className="button" onClick={() => update("thumbnail", "")}>Hapus Gambar</button>}<small>JPEG, PNG, atau WebP. Batas ukuran mengikuti validasi server. Tanpa gambar sampul, logo HiruAcademy digunakan di Blog.</small></section></aside></fieldset>
  </form>;
}
