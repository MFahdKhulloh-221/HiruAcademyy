"use client";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AdminDataTable, AdminDialog, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge, AdminTabs } from "@/components/admin-primitives";
import { AdminBlogArticlePreview, AdminBlogCardPreview, BlogThumbnail, type Article } from "@/components/admin-blog-preview";
import { useAdminContent } from "@/lib/public-content-api";

const tabs = ["Konten Artikel", "Pengaturan SEO & Pratinjau", "Jadwal & Penulis"];
const categories = ["Tips Belajar", "Grammar / Bunpou", "Listening / Choukai", "JLPT"];
const authors = ["Hiru Academy"];
const emptyArticle: Omit<Article, "id"> = { title: "", slug: "", excerpt: "", body: "", thumbnail: "", category: categories[0], seoTitle: "", metaDescription: "", featured: false, published: false, publishedAt: "", author: "Hiru Academy" };
function slugFromTitle(title: string) { return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function publicationDate(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const fixture = /^(\d{1,2}) Agustus (\d{4})$/.exec(value);
  if (fixture) return `${fixture[2]}-08-${fixture[1].padStart(2, "0")}`;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}
function displayPublicationDate(value: string) {
  const date = publicationDate(value);
  const timestamp = new Date(`${date}T00:00:00+07:00`);
  return date && Number.isFinite(timestamp.getTime()) ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(timestamp) : "—";
}

function articleError(article: Article, rows: Article[]) {
  if (!article.title.trim()) return "Judul artikel wajib diisi.";
  if (!article.body.trim()) return "Isi artikel wajib diisi.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug.trim())) return "Slug wajib diisi dengan huruf kecil, angka, dan tanda hubung, tanpa spasi.";
  if (rows.some((row) => row.id !== article.id && row.slug === article.slug.trim())) return "Slug sudah digunakan. Pilih slug lain.";
  if (!categories.includes(article.category)) return "Pilih kategori artikel yang tersedia.";
  if (!authors.includes(article.author)) return "Pilih penulis artikel yang tersedia.";
  if (article.publishedAt && /^\d{4}-\d{2}-\d{2}$/.test(article.publishedAt)) {
    const date = new Date(`${article.publishedAt}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(article.publishedAt) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== article.publishedAt) return "Tanggal publikasi tidak valid. Pilih tanggal yang benar.";
  }
  return "";
}

export function AdminBlogPrototype() {
  const { rows, loading, loadError, busy, mutate, reload } = useAdminContent<Article>("blog-articles");
  const [draft, setDraft] = useState<Article | null>(null);
  const [view, setView] = useState<Article | null>(null);
  const [deleting, setDeleting] = useState<Article | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const objectUrls = useRef(new Set<string>());
  useEffect(() => {
    const retained = new Set([...rows, draft, view, deleting].filter((article) => article !== null).map((article) => article.thumbnail));
    for (const url of objectUrls.current) {
      if (!retained.has(url)) { URL.revokeObjectURL(url); objectUrls.current.delete(url); }
    }
  }, [rows, draft, view, deleting]);
  useEffect(() => {
    const urls = objectUrls.current;
    return () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
  }, []);
  function uploadThumbnail(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !draft) return;
    if (!/^image\/[a-z0-9.+-]+$/i.test(file.type)) { setError("Pilih file gambar dengan MIME image/*."); return; }
    const thumbnail = URL.createObjectURL(file);
    objectUrls.current.add(thumbnail);
    setDraft({ ...draft, thumbnail });
    setError("");
  }
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const invalid = articleError(draft, rows);
    if (invalid) { setError(invalid); return; }
    const next: Article = { ...draft, title: draft.title.trim(), slug: draft.slug.trim(), excerpt: draft.excerpt.trim(), body: draft.body.trim(), thumbnail: draft.thumbnail.trim(), seoTitle: draft.seoTitle.trim(), metaDescription: draft.metaDescription.trim(), publishedAt: draft.publishedAt.trim() };
    try { await mutate(next); closeEditor(); setMessage("Artikel disimpan."); } catch (error) { setError(error instanceof Error ? error.message : "Artikel gagal disimpan."); }
  }

  async function toggle(row: Article) {
    const invalid = row.published ? "" : articleError(row, rows);
    if (invalid) { setMessage(invalid); return; }
    try { await mutate({ ...row, published: !row.published }); setMessage("Status publikasi disimpan."); } catch (error) { setMessage(error instanceof Error ? error.message : "Publikasi gagal."); }
  }

  return <AdminShell current="/admin/blog-seo"><main className="admin-public-prototype">
    <AdminPageHeader title="Blog" actions={<button type="button" className="button button-primary" onClick={() => { setError(""); setActiveTab(tabs[0]); setDraft({ ...emptyArticle, id: crypto.randomUUID() }); }}>Tambah Artikel</button>} />
    {loading && <p role="status">Memuat artikel…</p>}{loadError && <div role="alert">{loadError} <button type="button" onClick={reload}>Coba lagi</button></div>}
    <p role="status">{message}</p>
    <AdminSection title="Artikel"><AdminDataTable caption="Daftar Artikel Blog" rows={rows} rowKey={(row) => row.id} columns={[
      { key: "thumbnail", header: "Thumbnail", cell: (row) => <div className="admin-blog-table-thumb"><BlogThumbnail key={row.thumbnail} src={row.thumbnail} title={row.title} /></div> },
      { key: "title", header: "Judul", cell: (row) => row.title },
      { key: "slug", header: "Slug", cell: (row) => row.slug },
      { key: "category", header: "Kategori", cell: (row) => row.category },
      { key: "featured", header: "Featured", cell: (row) => row.featured ? "Ya" : "Tidak" },
      { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.published ? "Published" : "Draft"} /> },
      { key: "date", header: "Tanggal Publikasi", cell: (row) => displayPublicationDate(row.publishedAt) },
    ]} actions={{ cell: (row) => <div className="admin-page-actions">
      <button type="button" className="button" aria-label={`Lihat artikel ${row.title}`} onClick={() => setView(row)}>Lihat</button>
      <button type="button" className="button" aria-label={`Edit artikel ${row.title}`} onClick={() => { setError(""); setActiveTab(tabs[0]); setDraft({ ...row }); }}>Edit</button>
      <button type="button" className="button" aria-label={`${row.published ? "Jadikan Draft" : "Publikasikan"} artikel ${row.title}`} onClick={() => toggle(row)}>{row.published ? "Jadikan Draft" : "Publikasikan"}</button>
      <button type="button" className="button" aria-label={`Hapus artikel ${row.title}`} onClick={() => setDeleting(row)}>Hapus</button>
    </div> }} /></AdminSection>
    <AdminDialog open={Boolean(draft) && !view} title={rows.some((row) => row.id === draft?.id) ? "Edit Artikel" : "Tambah Artikel"} close={closeEditor}>
      {draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
        <AdminTabs label="Pengaturan Artikel" tabs={tabs} active={activeTab} onChange={setActiveTab}>
          {activeTab === tabs[0] && <div className="admin-blog-content-fields">
            <label className="admin-field">Thumbnail (opsional)<input value={draft.thumbnail} onChange={event => setDraft({ ...draft, thumbnail: event.target.value })} /><small>URL HTTP/HTTPS atau referensi penyimpanan.</small><input type="file" accept="image/*" onChange={uploadThumbnail} disabled /><small>Upload produksi belum tersedia.</small></label>
            <div className="blog-card-thumb admin-blog-upload-thumb"><BlogThumbnail key={draft.thumbnail} src={draft.thumbnail} title={draft.title} /></div>
            <label className="admin-field">Kategori<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="admin-field">Judul Artikel<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
            <label className="admin-field">Excerpt (opsional)<textarea rows={3} value={draft.excerpt} onChange={(event) => setDraft({ ...draft, excerpt: event.target.value })} /></label>
            <label className="admin-field">Isi Artikel<textarea rows={10} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} required /><small>Teks biasa; HTML tidak dijalankan.</small></label>
          </div>}
          {activeTab === tabs[1] && <div className="admin-blog-seo-layout">
            <div className="admin-blog-seo-fields">
              <label className="admin-field">Slug<input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} required /><small>Huruf kecil, angka, dan tanda hubung. Harus unik.</small></label>
              <button type="button" className="button" onClick={() => setDraft({ ...draft, slug: slugFromTitle(draft.title) })}>Buat Slug dari Judul</button>
              {rows.some((row) => row.id === draft.id && row.published && row.slug !== draft.slug.trim()) && <p role="status">Slug berubah untuk sesi ini; tautan publik tetap sama.</p>}
              <label className="admin-field">SEO Title (opsional)<input value={draft.seoTitle} onChange={(event) => setDraft({ ...draft, seoTitle: event.target.value })} /></label>
              <label className="admin-field">Meta Description (opsional)<textarea rows={3} value={draft.metaDescription} onChange={(event) => setDraft({ ...draft, metaDescription: event.target.value })} /></label>
              <label className="admin-field">Featured<select value={draft.featured ? "yes" : "no"} onChange={(event) => setDraft({ ...draft, featured: event.target.value === "yes" })}><option value="no">Tidak</option><option value="yes">Ya</option></select></label>
            </div>
            <section className="admin-blog-live-preview" aria-label="Pratinjau Kartu Publik"><h3>Pratinjau Kartu Publik</h3><AdminBlogCardPreview article={draft} date={displayPublicationDate(draft.publishedAt)} open={() => setView({ ...draft })} /><button type="button" className="button" onClick={() => setView({ ...draft })}>Pratinjau Artikel</button></section>
          </div>}
          {activeTab === tabs[2] && <div className="admin-blog-publication-fields">
            <label className="admin-field">Status<select value={draft.published ? "published" : "draft"} onChange={(event) => setDraft({ ...draft, published: event.target.value === "published" })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
            <label className="admin-field">Tanggal Publikasi (opsional)<input type="date" value={publicationDate(draft.publishedAt)} onChange={(event) => setDraft({ ...draft, publishedAt: event.target.value })} /><small>Artikel terbit setelah tanggal publikasi. Tanggal tanpa waktu menggunakan UTC.</small></label>
            <label className="admin-field">Nama Penulis / Kontributor<select value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })}>{authors.map((author) => <option key={author}>{author}</option>)}</select></label>
          </div>}
        </AdminTabs>
        {error && <p role="alert">{error}</p>}
        <div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" disabled={busy} className="button button-primary">Simpan Artikel</button></div>
      </form>}
    </AdminDialog>
    <AdminDialog open={Boolean(view)} title="Pratinjau Artikel" close={closeView}>{view && <AdminBlogArticlePreview article={view} date={displayPublicationDate(view.publishedAt)} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Artikel?" close={closeDelete} actions={<><button type="button" className="button" onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" disabled={busy} onClick={async () => { if (!deleting) return; try { await mutate(deleting, true); setDeleting(null); setMessage("Artikel dihapus."); } catch (error) { setMessage(error instanceof Error ? error.message : "Artikel gagal dihapus."); } }}>Hapus Artikel</button></>}><p>Hapus artikel {deleting?.title} dari sesi ini? Halaman publik tidak berubah.</p></AdminDialog>
  </main></AdminShell>;
}
