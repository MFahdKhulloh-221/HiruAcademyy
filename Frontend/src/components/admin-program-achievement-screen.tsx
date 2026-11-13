"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AdminDataTable, AdminDialog, AdminPageHeader, AdminSection, AdminShell } from "@/components/admin-primitives";
import { CertificateDocument } from "@/components/certificate-document";
import { ApiError } from "@/lib/api";
import { getCertificateIssuer, saveCertificateIssuer, type CertificateIssuer } from "@/lib/certificate-issuer-api";
import { adminAchievements, previewAchievement, updateAchievement, type AchievementConfiguration, type AchievementPage } from "@/lib/program-achievement-api";
import styles from "./admin-program-achievement-screen.module.css";

type Draft = { row: AchievementConfiguration; title: string; description: string };
const errorMessage = (error: unknown) => error instanceof ApiError && Object.keys(error.errors).length ? Object.values(error.errors).flat().join(" ") : error instanceof Error ? error.message : "Permintaan gagal. Silakan coba lagi.";

function ConfigurationPreview({ row, issuer, draft = false }: { row: AchievementConfiguration; issuer: CertificateIssuer; draft?: boolean }) {
  return <section className={styles.preview} aria-label={draft ? "Pratinjau draf konfigurasi" : "Pratinjau konfigurasi tersimpan"}>
    <p className="admin-kicker">{draft ? "Pratinjau draf — belum disimpan" : "Pratinjau sertifikat final"}</p>
    <p>Contoh Hilmi Pebriana · tanggal contoh 1 Januari 2026. Bukan sertifikat terbit.</p>
    <CertificateDocument studentName="Hilmi Pebriana" programName={row.program.name} title={row.settings.title ?? ""} description={row.settings.description ?? ""} issuedAt="2026-01-01T00:00:00+07:00" signatureDataUrl={issuer.signature_data_url} signaturePosition={issuer.signature_position} />
  </section>;
}

async function signaturePreview(file: File): Promise<string> {
  if (file.type !== "image/png" || file.size > 2 * 1024 * 1024) throw new Error("Tanda tangan harus PNG maksimal 2 MB.");
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte)) throw new Error("Berkas harus berupa PNG yang valid.");
  const image = await createImageBitmap(file);
  try {
    if (image.width !== 600 || image.height !== 200) throw new Error("Ukuran tanda tangan harus 600 × 200 piksel.");
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = 200;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Pratinjau gambar tidak tersedia. Coba browser lain.");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 600, 200).data;
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 600; x++) {
        if ((x === 0 || x === 599 || y === 0 || y === 199) && pixels[(y * 600 + x) * 4 + 3] !== 0) throw new Error("PNG tanda tangan harus berlatar transparan, termasuk seluruh tepi gambar.");
      }
    }
    return canvas.toDataURL("image/png");
  } finally { image.close(); }
}

export function AdminProgramAchievementScreen() {
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<AchievementPage<AchievementConfiguration> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mutationLock = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveError, setSaveError] = useState("");
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewReload, setPreviewReload] = useState(0);
  const [preview, setPreview] = useState<AchievementConfiguration | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [issuer, setIssuer] = useState<CertificateIssuer>({ signature_data_url: null, signature_position: "bottom-right" });
  const [issuerReady, setIssuerReady] = useState(false);
  const [issuerReload, setIssuerReload] = useState(0);
  const [issuerError, setIssuerError] = useState("");
  const [issuerMessage, setIssuerMessage] = useState("");
  const [issuerBusy, setIssuerBusy] = useState(false);
  const [signatureFile, setSignatureFile] = useState<File | undefined>();
  const [removeSignature, setRemoveSignature] = useState(false);
  const [issuerDirty, setIssuerDirty] = useState(false);
  const issuerLock = useRef(false);
  const signatureRevision = useRef(0);
  const selectedRow = data?.data.find((row) => row.program.id === selectedProgramId) ?? data?.data[0];
  const liveRow = draft ? { ...draft.row, settings: { ...draft.row.settings, title: draft.title, description: draft.description } } : selectedRow;

  useEffect(() => {
    const controller = new AbortController();
    getCertificateIssuer(controller.signal).then((result) => {
      if (!controller.signal.aborted) { setIssuer(result); setIssuerReady(true); }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setIssuerError(errorMessage(error));
    });
    return () => controller.abort();
  }, [issuerReload]);

  async function chooseSignature(file?: File) {
    const revision = ++signatureRevision.current;
    if (!file || issuerLock.current) return;
    issuerLock.current = true; setIssuerBusy(true); setIssuerError(""); setIssuerMessage("");
    try {
      const url = await signaturePreview(file);
      if (revision !== signatureRevision.current) return;
      setIssuer((current) => ({ ...current, signature_data_url: url }));
      setSignatureFile(file); setRemoveSignature(false); setIssuerDirty(true);
    } catch (error: unknown) { setIssuerError(errorMessage(error)); }
    finally { issuerLock.current = false; setIssuerBusy(false); }
  }

  async function saveIssuer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issuerReady || issuerLock.current) return;
    issuerLock.current = true; setIssuerBusy(true); setIssuerError(""); setIssuerMessage("");
    try {
      const saved = await saveCertificateIssuer({ signature: signatureFile, signature_position: issuer.signature_position, remove_signature: removeSignature });
      setIssuer(saved); setSignatureFile(undefined); setRemoveSignature(false); setIssuerDirty(false);
      setIssuerMessage("Tanda tangan global disimpan. Sertifikat yang sudah terbit tidak berubah.");
    } catch (error: unknown) { setIssuerError(errorMessage(error)); }
    finally { issuerLock.current = false; setIssuerBusy(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    adminAchievements(page, controller.signal).then((result) => {
      if (!controller.signal.aborted) { setData(result); setLoading(false); }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) { setLoadError(errorMessage(error)); setLoading(false); }
    });
    return () => controller.abort();
  }, [page, reload]);

  useEffect(() => {
    if (previewId === null) return;
    const controller = new AbortController();
    previewAchievement(previewId, controller.signal).then((result) => {
      if (!controller.signal.aborted) { setPreview(result); setPreviewLoading(false); }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) { setPreviewError(errorMessage(error)); setPreviewLoading(false); }
    });
    return () => controller.abort();
  }, [previewId, previewReload]);

  const closeEditor = useCallback(() => { if (!mutationLock.current) { setDraft(null); setSaveError(""); } }, []);
  const closePreview = useCallback(() => setPreviewId(null), []);

  function replaceRow(row: AchievementConfiguration) {
    setData((current) => current ? { ...current, data: current.data.map((item) => item.program.id === row.program.id ? row : item) } : current);
  }

  async function toggle(row: AchievementConfiguration) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true); setMutationError(""); setMessage("");
    try {
      const saved = await updateAchievement(row.program.id, { automatic_enabled: !row.settings.automatic_enabled });
      replaceRow(saved);
      setMessage(`Penerbitan otomatis ${saved.program.name}: ${saved.settings.automatic_enabled ? "ON" : "OFF"}. Pengaturan tersimpan.`);
    } catch (error: unknown) { setMutationError(errorMessage(error)); }
    finally { mutationLock.current = false; setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || mutationLock.current) return;
    if (!draft.title.trim()) { setSaveError("Judul wajib diisi."); return; }
    mutationLock.current = true;
    setBusy(true); setSaveError(""); setMessage(""); setMutationError("");
    try {
      const saved = await updateAchievement(draft.row.program.id, { title: draft.title.trim(), description: draft.description.trim() });
      replaceRow(saved); setDraft(null);
      setMessage(`Pengaturan ${saved.program.name} disimpan. Sertifikat yang sudah terbit tidak berubah.`);
    } catch (error: unknown) { setSaveError(errorMessage(error)); }
    finally { mutationLock.current = false; setBusy(false); }
  }

  function loadPage(next: number) {
    setLoading(true); setLoadError(""); setMutationError(""); setMessage(""); setData(null); setPage(next);
  }

  function retryList() { setLoading(true); setLoadError(""); setReload((value) => value + 1); }
  function openPreview(row: AchievementConfiguration) {
    setSelectedProgramId(row.program.id);
    setPreview(null); setPreviewError(""); setPreviewLoading(true); setPreviewId(row.program.id);
  }

  return <AdminShell current="/admin/sertifikat"><main className={`admin-public-prototype ${styles.screen}`}>
    <AdminPageHeader title="Sertifikat" description="Atur sertifikat penyelesaian untuk setiap program." />
    <p>Sesuaikan tampilan sertifikat untuk siswa di sini. Perubahan hanya berlaku untuk sertifikat baru. Sertifikat yang sudah diterima siswa tidak berubah.</p>
    <AdminSection title="Tanda Tangan Global" description="Berlaku untuk semua program. Perubahan pratinjau belum tersimpan sampai tombol Simpan ditekan.">
      <form className={`admin-prototype-form ${styles.content}`} onSubmit={saveIssuer}>
        {!issuerReady && !issuerError && <p role="status">Memuat tanda tangan…</p>}
        <label className="admin-field">{issuer.signature_data_url ? "Ganti tanda tangan" : "Unggah tanda tangan"}
          <input type="file" accept="image/png" disabled={!issuerReady || issuerBusy} aria-describedby="signature-help" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void chooseSignature(file); }} />
        </label>
        <p id="signature-help">PNG transparan, 600 × 200 piksel, maksimal 2 MB. Seluruh tepi gambar harus transparan. Server memvalidasi berkas sebelum menyimpan.</p>
        <label className="admin-field">Posisi tanda tangan
          <select value={issuer.signature_position} disabled={!issuerReady || issuerBusy} onChange={(event) => { setIssuer((current) => ({ ...current, signature_position: event.target.value as CertificateIssuer["signature_position"] })); setIssuerDirty(true); setIssuerMessage(""); }}>
            <option value="bottom-right">Kanan bawah</option><option value="bottom-left">Kiri bawah</option>
          </select>
        </label>
        {issuerError && <p role="alert">{issuerError}</p>}
        {!issuerReady && issuerError && <button type="button" className="button" onClick={() => { setIssuerError(""); setIssuerReload((value) => value + 1); }}>Coba Lagi</button>}
        {issuerMessage && <p role="status">{issuerMessage}</p>}
        {issuerDirty && <p role="status">Perubahan tanda tangan belum disimpan.</p>}
        <div className="admin-page-actions">
          <button type="button" className="button" disabled={!issuerReady || issuerBusy || !issuer.signature_data_url} onClick={() => { signatureRevision.current += 1; setIssuer((current) => ({ ...current, signature_data_url: null })); setSignatureFile(undefined); setRemoveSignature(true); setIssuerDirty(true); setIssuerError(""); setIssuerMessage(""); }}>Hapus tanda tangan</button>
          <button type="submit" className="button button-primary" disabled={!issuerReady || issuerBusy || !issuerDirty}>{issuerBusy ? "Memproses…" : "Simpan Tanda Tangan Global"}</button>
        </div>
      </form>
    </AdminSection>
    <AdminSection title="Pratinjau Sertifikat Final" description="Satu desain sertifikat untuk semua program. Nama siswa dan tanggal hanya contoh.">
      {selectedRow && <label className="admin-field">Program pratinjau
        <select value={selectedRow.program.id} onChange={(event) => setSelectedProgramId(Number(event.target.value))}>
          {data?.data.map((row) => <option key={row.program.id} value={row.program.id}>{row.program.name}</option>)}
        </select>
      </label>}
      {liveRow ? <ConfigurationPreview row={liveRow} issuer={issuer} draft={!!draft || issuerDirty} /> : <p role="status">{loading ? "Memuat pratinjau…" : "Pilih program setelah daftar program tersedia."}</p>}
    </AdminSection>
    {message && <p role="status">{message}</p>}
    {mutationError && <p role="alert">{mutationError}</p>}
    <AdminSection title="Pengaturan Sertifikat per Program" description="Default: belum ada pengaturan tersimpan. Custom: pengaturan program sudah disimpan.">
      {loading && <p role="status">Memuat program…</p>}
      {loadError ? <div><p role="alert">{loadError}</p><button type="button" className="button" onClick={retryList}>Coba Lagi</button></div> : <AdminDataTable
        caption="Pengaturan Sertifikat per Program" loading={loading} rows={data?.data ?? []} rowKey={(row) => String(row.program.id)} empty="Belum ada program."
        columns={[
          { key: "program", header: "Program", cell: (row) => <><strong>{row.program.name}</strong><p>{row.program.code}</p></> },
          { key: "title", header: "Judul", cell: (row) => row.settings.title || "—" },
          { key: "configuration", header: "Konfigurasi", cell: (row) => row.is_default ? "Default" : "Custom" },
          { key: "automatic", header: "Penerbitan otomatis", cell: (row) => <button type="button" className="button" role="switch" aria-checked={row.settings.automatic_enabled} aria-label={`Penerbitan otomatis ${row.program.name}`} disabled={busy || loading} onClick={() => void toggle(row)}>{row.settings.automatic_enabled ? "ON" : "OFF"}</button> },
        ]}
        actions={{ cell: (row) => <div className="admin-page-actions">
          <button type="button" className="button" disabled={busy} aria-label={`Edit ${row.program.name}`} onClick={() => { setSelectedProgramId(row.program.id); setSaveError(""); setDraft({ row, title: row.settings.title ?? "", description: row.settings.description ?? "" }); }}>Edit</button>
          <button type="button" className="button" disabled={busy} aria-label={`Pratinjau tersimpan ${row.program.name}`} onClick={() => openPreview(row)}>Pratinjau tersimpan</button>
        </div> }} />}
      {data && !loading && !loadError && <nav className={styles.pagination} aria-label="Halaman program">
        <button type="button" className="button" disabled={busy || data.meta.current_page <= 1} onClick={() => loadPage(data.meta.current_page - 1)}>Sebelumnya</button>
        <span>Halaman {data.meta.current_page} dari {data.meta.last_page} · {data.meta.total} program</span>
        <button type="button" className="button" disabled={busy || data.meta.current_page >= data.meta.last_page} onClick={() => loadPage(data.meta.current_page + 1)}>Berikutnya</button>
      </nav>}
    </AdminSection>
    <AdminDialog open={draft !== null} title="Edit Sertifikat" close={closeEditor}>
      {draft && <form className={`admin-prototype-form ${styles.content}`} onSubmit={save}>
        <p>Program: {draft.row.program.name} ({draft.row.program.code})</p>
        <p>Konfigurasi tersimpan: {draft.row.is_default ? "Default" : "Custom"}. Menyimpan perubahan menjadikan konfigurasi Custom.</p>
        <label className="admin-field">Judul<input required value={draft.title} disabled={busy} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="admin-field">Deskripsi<textarea value={draft.description} disabled={busy} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <ConfigurationPreview draft issuer={issuer} row={{ ...draft.row, settings: { ...draft.row.settings, title: draft.title, description: draft.description } }} />
        {saveError && <p role="alert">{saveError}</p>}
        <div className="admin-page-actions"><button type="button" className="button" disabled={busy} onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Pengaturan"}</button></div>
      </form>}
    </AdminDialog>
    <AdminDialog open={previewId !== null} title="Pratinjau Konfigurasi Tersimpan" close={closePreview}>
      <div className={styles.content}>
        {previewLoading && <p role="status">Memuat pratinjau…</p>}
        {previewError && <><p role="alert">{previewError}</p><button type="button" className="button" onClick={() => { setPreviewError(""); setPreviewLoading(true); setPreviewReload((value) => value + 1); }}>Coba Lagi</button></>}
        {preview && !previewLoading && !previewError && <ConfigurationPreview row={preview} issuer={issuer} draft={issuerDirty} />}
      </div>
    </AdminDialog>
  </main></AdminShell>;
}
