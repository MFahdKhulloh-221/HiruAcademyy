"use client";

import Image from "next/image";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";

const approvedShowcase = [
  { id: "dashboard", label: "Dashboard", imageSrc: "/showcase/dashboard.png" },
  { id: "journey", label: "Pembelajaran", imageSrc: "/showcase/pembelajaran.png" },
  { id: "lesson", label: "Materi / Video Lesson", imageSrc: "/showcase/video.png" },
  { id: "flashcard", label: "Flashcard", imageSrc: "/showcase/flashcard.png" },
  { id: "evaluation", label: "Try Out / Evaluasi", imageSrc: "/showcase/tryout.png" },
] as const;
type Showcase = { id: string; label: string; imageSrc: string; alt: string; order: number; visible: boolean };
type Draft = Omit<Showcase, "order"> & { order: string };

export function AdminShowcasePrototype() {
  const [rows, setRows] = useState<Showcase[]>(() => approvedShowcase.map((item, index) => ({ ...item, alt: `Tampilan antarmuka ${item.label} Hiru Academy`, order: index + 1, visible: true })));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const temporaryUrls = useRef(new Set<string>());
  const latestDraft = useRef(draft);
  const latestRows = useRef(rows);
  useEffect(() => {
    latestDraft.current = draft;
    latestRows.current = rows;
  }, [draft, rows]);
  useEffect(() => {
    const urls = temporaryUrls.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);

  const release = useCallback((url: string) => {
    if (temporaryUrls.current.delete(url)) URL.revokeObjectURL(url);
  }, []);
  const closeEditor = useCallback(() => {
    const currentDraft = latestDraft.current;
    if (currentDraft && !latestRows.current.some((row) => row.imageSrc === currentDraft.imageSrc)) release(currentDraft.imageSrc);
    setDraft(null);
    setError("");
  }, [release]);
  const closePreview = useCallback(() => setPreview(null), []);
  const previewRow = rows.find((row) => row.id === preview);

  function changeSource(imageSrc: string) {
    if (!draft) return;
    if (!rows.some((row) => row.imageSrc === draft.imageSrc)) release(draft.imageSrc);
    setDraft({ ...draft, imageSrc });
    setError("");
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !draft) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) { setError("Pilih gambar PNG, JPEG, WebP, atau GIF yang valid."); return; }
    const url = URL.createObjectURL(file);
    temporaryUrls.current.add(url);
    changeSource(url);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const order = Number(draft.order);
    if (!draft.alt.trim()) { setError("Teks alternatif gambar wajib diisi."); return; }
    if (!draft.order.trim() || !Number.isSafeInteger(order) || order < 1 || order > rows.length) { setError(`Urutan harus berupa angka bulat dari 1 hingga ${rows.length}.`); return; }
    if (!approvedShowcase.some((item) => item.imageSrc === draft.imageSrc) && !temporaryUrls.current.has(draft.imageSrc)) { setError("Pilih gambar yang tersedia atau unggah gambar sementara yang valid."); return; }
    const oldRow = rows.find((row) => row.id === draft.id);
    if (!oldRow) return;
    const next: Showcase = { ...oldRow, imageSrc: draft.imageSrc, alt: draft.alt.trim(), order, visible: draft.visible };
    setRows((current) => {
      const reordered = current.filter((row) => row.id !== draft.id).sort((a, b) => a.order - b.order);
      reordered.splice(order - 1, 0, next);
      return reordered.map((row, index) => ({ ...row, order: index + 1 }));
    });
    if (oldRow.imageSrc !== draft.imageSrc && !rows.some((row) => row.id !== draft.id && row.imageSrc === oldRow.imageSrc)) release(oldRow.imageSrc);
    setDraft(null);
    setError("");
    setMessage("Showcase disimpan untuk pratinjau sesi ini. Halaman publik tidak berubah.");
  }

  return <AdminShell current="/admin/showcase"><main className="admin-public-prototype">
    <AdminPageHeader title="Showcase" description="Pratinjau lokal. Identifier dan copy showcase dikunci sesuai fixture publik." />
    <p>Perubahan pada tahap prototype belum tersimpan ke server.</p>
    <p role="status">{message}</p>
    <AdminSection title="Showcase LMS">
      <AdminFilterToolbar><button type="button" className="button" onClick={() => setPreview("public")}>Pratinjau urutan tampil</button></AdminFilterToolbar>
      <AdminDataTable caption="Gambar showcase" rows={[...rows].sort((a, b) => a.order - b.order)} rowKey={(row) => row.id} columns={[
        { key: "id", header: "Identifier (dikunci)", cell: (row) => row.id },
        { key: "label", header: "Copy (dikunci)", cell: (row) => row.label },
        { key: "image", header: "Gambar", cell: (row) => <Image src={row.imageSrc} alt={row.alt} width={180} height={100} unoptimized={row.imageSrc.startsWith("blob:")} /> },
        { key: "alt", header: "Teks alternatif", cell: (row) => row.alt },
        { key: "order", header: "Urutan", cell: (row) => row.order },
        { key: "visible", header: "Status tampil", cell: (row) => <AdminStatusBadge status={row.visible ? "Aktif" : "Nonaktif"} /> },
      ]} actions={{ cell: (row) => <div className="admin-page-actions"><button type="button" className="button" onClick={() => setPreview(row.id)} aria-label={`Pratinjau ${row.label}`}>Pratinjau</button><button type="button" className="button" onClick={() => { setError(""); setDraft({ ...row, order: String(row.order) }); }} aria-label={`Edit gambar ${row.label}`}>Edit gambar / tampilan</button></div> }} />
    </AdminSection>
    <AdminDialog open={Boolean(draft)} title="Edit gambar / tampilan" close={closeEditor}>
      {draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
        <label className="admin-field">Identifier (dikunci)<input value={draft.id} readOnly /></label>
        <label className="admin-field">Copy (dikunci)<input value={draft.label} readOnly /></label>
        <label className="admin-field">Gambar tersedia<select value={draft.imageSrc.startsWith("blob:") || !draft.imageSrc ? "temporary" : draft.imageSrc} onChange={(event) => changeSource(event.target.value)}><option value="temporary" disabled>Gambar sementara</option>{approvedShowcase.map((item) => <option key={item.id} value={item.imageSrc}>{item.imageSrc}</option>)}</select></label>
        <label className="admin-field">Ganti gambar sementara<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={chooseFile} /><small>File hanya untuk pratinjau lokal, tidak diunggah.</small></label>
        <label className="admin-field">Teks alternatif<input value={draft.alt} onChange={(event) => setDraft({ ...draft, alt: event.target.value })} required /></label>
        <label className="admin-field">Urutan<input type="number" min="1" max={rows.length} step="1" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} required /><small>Item lain bergeser otomatis sesuai urutan baru.</small></label>
        <label className="admin-field">Status tampil<select value={draft.visible ? "visible" : "hidden"} onChange={(event) => setDraft({ ...draft, visible: event.target.value === "visible" })}><option value="visible">Tampil</option><option value="hidden">Tidak tampil</option></select></label>
        {draft.imageSrc && <figure className="lms-preview admin-showcase-preview"><figcaption>{draft.label}</figcaption><div className="lms-preview-image-wrap"><Image className="lms-preview-img" src={draft.imageSrc} alt={draft.alt} width={860} height={480} unoptimized={draft.imageSrc.startsWith("blob:")} onError={() => { if (!rows.some((row) => row.imageSrc === draft.imageSrc)) release(draft.imageSrc); setDraft({ ...draft, imageSrc: "" }); setError("Gambar tidak dapat dibaca. Pilih gambar lain sebelum menyimpan."); }} /></div></figure>}
        {error && <p role="alert">{error}</p>}
        <div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary">Simpan showcase</button></div>
      </form>}
    </AdminDialog>
    <AdminDialog open={Boolean(preview)} title="Pratinjau showcase" close={closePreview}>
      {(preview === "public" ? rows.filter((row) => row.visible).sort((a, b) => a.order - b.order) : previewRow ? [previewRow] : []).map((row) => <figure className="lms-preview admin-showcase-preview" key={row.id}><figcaption>{row.label}</figcaption><div className="lms-preview-image-wrap"><Image className="lms-preview-img" src={row.imageSrc} alt={row.alt} width={860} height={480} unoptimized={row.imageSrc.startsWith("blob:")} /></div></figure>)}
      {preview === "public" && !rows.some((row) => row.visible) && <p>Belum ada showcase dengan status tampil.</p>}
    </AdminDialog>
  </main></AdminShell>;
}
