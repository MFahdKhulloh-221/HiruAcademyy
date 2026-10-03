"use client";

import { type FormEvent, useCallback, useState } from "react";
import { LuSearch } from "react-icons/lu";
import { AdminConfirmDialog, AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
const programFixtures: { code: string; name: string; status: string; selfStudyPrice: number | null; selfStudyAvailable: boolean; senseiPrice: number | null; senseiAvailable: boolean }[] = [
  { code: "DASAR", name: "Dasar Bahasa Jepang", status: "Published", selfStudyPrice: 99000, selfStudyAvailable: true, senseiPrice: 350000, senseiAvailable: true },
  { code: "N5", name: "JLPT N5", status: "Published", selfStudyPrice: 99000, selfStudyAvailable: true, senseiPrice: 350000, senseiAvailable: true },
  { code: "N4", name: "JLPT N4", status: "Published", selfStudyPrice: 99000, selfStudyAvailable: true, senseiPrice: 350000, senseiAvailable: true },
  { code: "N3", name: "JLPT N3", status: "Published", selfStudyPrice: 199000, selfStudyAvailable: true, senseiPrice: 450000, senseiAvailable: true },
  { code: "N2", name: "JLPT N2", status: "Published", selfStudyPrice: 249000, selfStudyAvailable: true, senseiPrice: 550000, senseiAvailable: true },
  { code: "N1", name: "JLPT N1", status: "OPEN", selfStudyPrice: null, selfStudyAvailable: true, senseiPrice: null, senseiAvailable: true },
  { code: "SSW", name: "SSW Pengolahan Makanan", status: "Published", selfStudyPrice: 299000, selfStudyAvailable: true, senseiPrice: null, senseiAvailable: false },
  { code: "INTERVIEW", name: "Persiapan Interview", status: "Published", selfStudyPrice: 199000, selfStudyAvailable: true, senseiPrice: null, senseiAvailable: false },
];
const initialPrices = programFixtures.flatMap((program) => [
  ...(program.selfStudyAvailable ? [{ id: `${program.code}-lms`, code: program.code, program: program.name, status: program.status, mode: "Belajar Mandiri", months: 6, price: program.selfStudyPrice }] : []),
  ...(program.senseiAvailable ? [{ id: `${program.code}-sensei`, code: program.code, program: program.name, status: program.status, mode: "Kelas bersama Sensei", months: 1, price: program.senseiPrice }] : []),
]);
const notice = "Perubahan pada tahap prototype belum tersimpan ke server.";
const promoStatuses = ["Draft", "Aktif", "Nonaktif"] as const;
type PromoStatus = (typeof promoStatuses)[number];
const rupiah = (value: number) => `Rp${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
type Promo = { id: string; name: string; priceId: string; percentage: number; status: PromoStatus; start: string; end: string; note: string };
type Draft = Omit<Promo, "percentage"> & { percentage: string };

export function AdminCommercialPrototype() {
  const [priceRows, setPriceRows] = useState(() => initialPrices.map((row) => ({ ...row })));
  const [priceDraft, setPriceDraft] = useState<{ id: string; price: string } | null>(null);
  const [priceError, setPriceError] = useState("");
  const closePriceEditor = useCallback(() => { setPriceDraft(null); setPriceError(""); }, []);
  const editingPrice = priceRows.find((row) => row.id === priceDraft?.id);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<{ promo: Promo; action: "toggle" | "delete" } | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeConfirmation = useCallback(() => setPending(null), []);
  const selectedPrice = priceRows.find((row) => row.id === draft?.priceId);
  const percentage = Number(draft?.percentage);
  const validPercentage = Boolean(draft?.percentage.trim()) && Number.isFinite(percentage) && percentage >= 0 && percentage <= 100;

  function edit(promo?: Promo) {
    setError("");
    setDraft(promo ? { ...promo, percentage: String(promo.percentage) } : { id: "", name: "", priceId: priceRows[0].id, percentage: "", status: "Draft", start: "", end: "", note: "" });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) { setError("Nama promo wajib diisi."); return; }
    if (!selectedPrice || selectedPrice.price === null || !Number.isFinite(selectedPrice.price) || selectedPrice.price < 0) { setError("Harga belum tersedia. Pilih program dengan harga yang diketahui."); return; }
    if (!validPercentage) { setError("Diskon harus antara 0–100%."); return; }
    if (![draft.start, draft.end].every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date)) { setError("Tanggal mulai dan tanggal akhir wajib diisi dengan tanggal yang valid."); return; }
    if (draft.end < draft.start) { setError("Tanggal akhir tidak boleh sebelum tanggal mulai."); return; }
    if (draft.status === "Aktif" && promos.some((promo) => promo.id !== draft.id && promo.priceId === draft.priceId && promo.status === "Aktif")) { setError("Program ini sudah memiliki promo aktif. Nonaktifkan promo tersebut terlebih dahulu."); return; }
    const promo: Promo = { ...draft, id: draft.id || crypto.randomUUID(), name: draft.name.trim(), percentage };
    setPromos((current) => draft.id ? current.map((item) => item.id === draft.id ? promo : item) : [...current, promo]);
    setMessage(notice);
    closeEditor();
  }

  function confirm() {
    if (!pending) return;
    const { promo, action } = pending;
    if (action === "toggle" && promo.status !== "Aktif" && promos.some((item) => item.id !== promo.id && item.priceId === promo.priceId && item.status === "Aktif")) {
      setMessage("Program ini sudah memiliki promo aktif. Nonaktifkan promo tersebut terlebih dahulu.");
      closeConfirmation();
      return;
    }
    setPromos((current) => action === "delete" ? current.filter((item) => item.id !== promo.id) : current.map((item) => item.id === promo.id ? { ...item, status: item.status === "Aktif" ? "Nonaktif" : "Aktif" } : item));
    setMessage(notice);
    closeConfirmation();
  }

  function savePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!priceDraft || !editingPrice || editingPrice.price === null) return;
    const price = Number(priceDraft.price);
    if (!priceDraft.price.trim() || !Number.isSafeInteger(price) || price < 0) { setPriceError("Harga harus berupa angka bulat rupiah minimal 0."); return; }
    setPriceRows((current) => current.map((row) => row.id === priceDraft.id ? { ...row, price } : row));
    setMessage(notice);
    closePriceEditor();
  }

  return <AdminShell current="/admin/program-harga"><main className="admin-public-prototype">
    <AdminPageHeader title="Harga & Promo" description={notice} />
    <p role="status">{message}</p>
    <AdminSection title="Harga program" description="Mandiri: 6 bulan. Sensei: 1 bulan.">
      <AdminFilterToolbar><label className="admin-prototype-search"><LuSearch aria-hidden="true" /><input aria-label="Cari program" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Cari program atau cara belajar" /></label></AdminFilterToolbar>
      <AdminDataTable caption="Harga dan pratinjau promo" rows={priceRows.filter((row) => `${row.code} ${row.program} ${row.mode}`.toLowerCase().includes(filter.trim().toLowerCase()))} rowKey={(row) => row.id} columns={[
        { key: "code", header: "Kode", cell: (row) => row.code },
        { key: "program", header: "Program", cell: (row) => row.program },
        { key: "status", header: "Status program", cell: (row) => <AdminStatusBadge status={row.status} /> },
        { key: "mode", header: "Cara belajar", cell: (row) => row.mode },
        { key: "duration", header: "Durasi", cell: (row) => `${row.months} bulan` },
        { key: "normal", header: "Harga normal", cell: (row) => row.price !== null && Number.isFinite(row.price) && row.price >= 0 ? rupiah(row.price) : "OPEN" },
        { key: "discount", header: "Diskon aktif", cell: (row) => { const promo = promos.find((item) => item.priceId === row.id && item.status === "Aktif"); return row.price === null ? "OPEN" : promo ? `${promo.percentage}% (${rupiah(row.price * promo.percentage / 100)})` : "Tidak ada"; } },
        { key: "final", header: "Harga promosi", cell: (row) => { const promo = promos.find((item) => item.priceId === row.id && item.status === "Aktif"); return row.price !== null && Number.isFinite(row.price) && row.price >= 0 ? rupiah(row.price - row.price * (promo?.percentage ?? 0) / 100) : "OPEN"; } },
      ]} actions={{ cell: (row) => <button type="button" className="button" disabled={row.price === null} onClick={() => { setPriceError(""); setPriceDraft({ id: row.id, price: String(row.price) }); }} aria-label={`Edit Harga ${row.program} ${row.mode}`}>Edit Harga</button> }} />
    </AdminSection>
    <AdminDialog open={Boolean(priceDraft)} title="Edit Harga" close={closePriceEditor}>
      {priceDraft && editingPrice && <form className="admin-prototype-form" onSubmit={savePrice} noValidate>
        <p>{editingPrice.code} — {editingPrice.program} — {editingPrice.status}</p>
        <p>{editingPrice.mode}: {editingPrice.months} bulan</p>
        <label className="admin-field">Harga normal<input type="number" min="0" step="1" value={priceDraft.price} onChange={(event) => setPriceDraft({ ...priceDraft, price: event.target.value })} required /></label>
        {priceError && <p role="alert">{priceError}</p>}
        <div className="admin-page-actions"><button type="button" className="button" onClick={closePriceEditor}>Batal</button><button type="submit" className="button button-primary">Simpan harga</button></div>
      </form>}
    </AdminDialog>
    <AdminSection title="Promo" actions={<button type="button" className="button button-primary" onClick={() => edit()}>Tambah promo</button>}>
      <AdminDataTable caption="Promo sesi ini" rows={promos} rowKey={(row) => row.id} empty="Belum ada promo. Tambahkan promo untuk mencoba pratinjau diskon." columns={[
        { key: "name", header: "Nama promo", cell: (row) => row.name },
        { key: "program", header: "Program", cell: (row) => { const price = priceRows.find((item) => item.id === row.priceId); return `${price?.program} — ${price?.mode}`; } },
        { key: "percentage", header: "Diskon", cell: (row) => `${row.percentage}%` },
        { key: "start", header: "Tanggal mulai", cell: (row) => row.start },
        { key: "end", header: "Tanggal akhir", cell: (row) => row.end },
        { key: "note", header: "Catatan", cell: (row) => row.note || "—" },
        { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.status} /> },
      ]} actions={{ cell: (row) => <div className="admin-page-actions"><button type="button" className="button" onClick={() => edit(row)} aria-label={`Edit promo ${row.name}`}>Edit</button><button type="button" className="button" onClick={() => setPending({ promo: row, action: "toggle" })} aria-label={`${row.status === "Aktif" ? "Nonaktifkan" : "Aktifkan"} promo ${row.name}`}>{row.status === "Aktif" ? "Nonaktifkan" : "Aktifkan"}</button><button type="button" className="button" onClick={() => setPending({ promo: row, action: "delete" })} aria-label={`Hapus promo ${row.name}`}>Hapus</button></div> }} />
    </AdminSection>
    <AdminDialog open={Boolean(draft)} title={draft?.id ? "Edit promo" : "Tambah promo"} close={closeEditor}>
      {draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
        <label className="admin-field">Nama promo<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
        <label className="admin-field">Program dan cara belajar<select value={draft.priceId} onChange={(event) => setDraft({ ...draft, priceId: event.target.value })}>{priceRows.filter((row) => row.price !== null && Number.isFinite(row.price) && row.price >= 0).map((row) => <option key={row.id} value={row.id}>{row.program} — {row.mode} — {row.months} bulan</option>)}</select></label>
        <label className="admin-field">Persentase diskon<input type="number" min="0" max="100" step="any" value={draft.percentage} onChange={(event) => setDraft({ ...draft, percentage: event.target.value })} required /></label>
        <label className="admin-field">Tanggal mulai<input type="date" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} required /></label>
        <label className="admin-field">Tanggal akhir<input type="date" min={draft.start || undefined} value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} required /></label>
        <label className="admin-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PromoStatus })}>{promoStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label className="admin-field">Catatan (opsional)<textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
        <AdminSection title="Pratinjau perhitungan"><p>Harga normal: {selectedPrice && selectedPrice.price !== null ? rupiah(selectedPrice.price) : "OPEN"}</p><p>Diskon: {selectedPrice && selectedPrice.price !== null && validPercentage ? rupiah(selectedPrice.price * percentage / 100) : "Isi persentase yang valid"}</p><p>Harga promosi: {selectedPrice && selectedPrice.price !== null && validPercentage ? rupiah(selectedPrice.price - selectedPrice.price * percentage / 100) : "Belum tersedia"}</p><p>Pratinjau perhitungan tidak mengaktifkan promo dan tidak mengubah harga dasar.</p></AdminSection>
        {error && <p role="alert">{error}</p>}
        <div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary">Simpan promo</button></div>
      </form>}
    </AdminDialog>
    <AdminConfirmDialog open={Boolean(pending)} title={pending?.action === "delete" ? "Hapus promo?" : "Ubah status promo?"} close={closeConfirmation} actions={<><button type="button" className="button" onClick={closeConfirmation}>Batal</button><button type="button" className="button button-primary" onClick={confirm}>Konfirmasi</button></>}><p>{pending?.promo.name}: {pending?.action === "delete" ? "promo akan dihapus dari sesi ini." : pending?.promo.status === "Aktif" ? "promo akan dinonaktifkan." : "promo akan diaktifkan."} Harga dasar tidak berubah.</p></AdminConfirmDialog>
  </main></AdminShell>;
}
