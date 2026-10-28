"use client";

import Link from "next/link";
import { LandingPriceCard } from "@/components/landing-price-card";
import { formatProgramPrice } from "@/lib/format-program-price";
import { landingOffers } from "@/lib/landing-offers";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { commercialCode, commercialData, commercialWrite, type Offer } from "@/lib/commercial-api";
import { LuSearch } from "react-icons/lu";
import { AdminConfirmDialog, AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
type PriceRow = { id: string; code: string; program: string; status: string; programStatus: string; mode: string; months: number; price: number | null; effective: number | null; discount: number; percentage: number };
type ApiPromo = { id: number; name: string; program_offer_id: number; discount_percent: number; status: string; starts_at: string | null; ends_at: string | null; note: string | null };
const notice = "Kelola harga dan durasi penawaran. Status program dikelola melalui Journey Builder.";
const statusLabel = (status: string) => status === "active" ? "Aktif" : status === "inactive" ? "Nonaktif" : status === "draft" ? "Draft" : "Belum diketahui";
const promoStatuses = ["Draft", "Aktif", "Nonaktif"] as const;
type PromoStatus = (typeof promoStatuses)[number];
const rupiah = (value: number) => `Rp${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
type Promo = { id: string; name: string; priceId: string; percentage: number; status: PromoStatus; start: string; end: string; note: string };
type Draft = Omit<Promo, "percentage"> & { percentage: string };

export function AdminCommercialPrototype() {
  const [priceRows, setPriceRows] = useState<PriceRow[]>([]);
  const [priceDraft, setPriceDraft] = useState<{ id: string; price: string; months: string } | null>(null);
  const [priceError, setPriceError] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const closePriceEditor = useCallback(() => { setPriceDraft(null); setPriceError(""); }, []);
  const editingPrice = priceRows.find((row) => row.id === priceDraft?.id);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<{ promo: Promo; action: "toggle" | "delete" } | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const promoLock = useRef(false);
  const [confirmError, setConfirmError] = useState("");
  const closeEditor = useCallback(() => { if (promoLock.current) return; setDraft(null); setError(""); }, []);
  const closeConfirmation = useCallback(() => { if (promoLock.current) return; setPending(null); setConfirmError(""); }, []);
  const refresh = useCallback(async () => {
    const [offers, promotions] = await Promise.all([commercialData<Offer[]>("/api/admin/offers"), commercialData<ApiPromo[]>("/api/admin/promotions")]);
    setPriceRows(offers.map(offer => ({ id: String(offer.id), code: commercialCode(offer.program.code), program: offer.program.name, status: offer.status ?? "", programStatus: offer.program_status ?? "", mode: offer.plan_code === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei", months: offer.duration_months, price: offer.base_price, effective: offer.effective_price, discount: offer.discount_amount, percentage: offer.discount_percent })));
    setPromos(promotions.map(promo => ({ id: String(promo.id), name: promo.name, priceId: String(promo.program_offer_id), percentage: Number(promo.discount_percent), status: promo.status === "active" ? "Aktif" : promo.status === "draft" ? "Draft" : "Nonaktif", start: promo.starts_at?.slice(0, 10) || "", end: promo.ends_at?.slice(0, 10) || "", note: promo.note || "" })));
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try { await refresh(); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "Data gagal dimuat."); }
    finally { setLoading(false); }
  }, [refresh]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) return load(); }); return () => { active = false; }; }, [load]);
  const eligiblePrices = priceRows.filter(row => row.price !== null && Number.isFinite(row.price) && row.price >= 0);
  const selectedPrice = priceRows.find((row) => row.id === draft?.priceId);
  const percentage = Number(draft?.percentage);
  const validPercentage = Boolean(draft?.percentage.trim()) && Number.isFinite(percentage) && percentage >= 0 && percentage <= 100;

  function edit(promo?: Promo) {
    if (promoLock.current || (!promo && !eligiblePrices.length)) return;
    setError("");
    setDraft(promo ? { ...promo, percentage: String(promo.percentage) } : { id: "", name: "", priceId: eligiblePrices[0]?.id || "", percentage: "", status: "Draft", start: "", end: "", note: "" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || promoLock.current) return;
    setError("");
    if (!draft.name.trim()) { setError("Nama promo wajib diisi."); return; }
    if (!selectedPrice || selectedPrice.price === null || !Number.isFinite(selectedPrice.price) || selectedPrice.price < 0) { setError("Harga belum tersedia. Pilih program dengan harga yang diketahui."); return; }
    if (!validPercentage) { setError("Diskon harus antara 0–100%."); return; }
    if (![draft.start, draft.end].every((date) => !date || (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date))) { setError("Tanggal mulai dan tanggal akhir harus berupa tanggal yang valid atau kosong."); return; }
    if (draft.start && draft.end && draft.end < draft.start) { setError("Tanggal akhir tidak boleh sebelum tanggal mulai."); return; }
    if (draft.status === "Aktif" && promos.some((promo) => promo.id !== draft.id && promo.priceId === draft.priceId && promo.status === "Aktif")) { setError("Program ini sudah memiliki promo aktif. Nonaktifkan promo tersebut terlebih dahulu."); return; }
    promoLock.current = true; setPromoBusy(true);
    try {
      await commercialWrite(`/api/admin/promotions${draft.id ? `/${draft.id}` : ""}`, draft.id ? "PATCH" : "POST", { name: draft.name.trim(), program_offer_id: Number(draft.priceId), discount_percent: percentage, status: draft.status === "Aktif" ? "active" : draft.status === "Draft" ? "draft" : "inactive", starts_at: draft.start || null, ends_at: draft.end || null, note: draft.note });
      setDraft(null); setError(""); await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Permintaan belum berhasil."); }
    finally { promoLock.current = false; setPromoBusy(false); }
  }

  async function confirm() {
    if (!pending || promoLock.current) return;
    setConfirmError("");
    const { promo, action } = pending;
    if (action === "toggle" && promo.status !== "Aktif" && promos.some((item) => item.id !== promo.id && item.priceId === promo.priceId && item.status === "Aktif")) {
      setConfirmError("Program ini sudah memiliki promo aktif. Nonaktifkan promo tersebut terlebih dahulu.");
      return;
    }
    promoLock.current = true; setPromoBusy(true);
    try {
      await commercialWrite(`/api/admin/promotions/${promo.id}`, action === "delete" ? "DELETE" : "PATCH", action === "delete" ? undefined : { status: promo.status === "Aktif" ? "inactive" : "active" });
      setPending(null); await load();
    } catch (error) { setConfirmError(error instanceof Error ? error.message : "Permintaan belum berhasil."); }
    finally { promoLock.current = false; setPromoBusy(false); }
  }

  async function savePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!priceDraft || !editingPrice || savingPrice) return;
    const price = Number(priceDraft.price);
    const months = Number(priceDraft.months);
    if (priceDraft.price.trim() && (!Number.isSafeInteger(price) || price < 0 || price > 2147483647)) { setPriceError("Harga harus berupa rupiah bulat antara 0 dan 2147483647."); return; }
    if (!priceDraft.months.trim() || !Number.isSafeInteger(months) || months < 1 || months > 32767) { setPriceError("Durasi harus berupa bulan bulat antara 1 dan 32767."); return; }
    setSavingPrice(true);
    try {
      await commercialWrite(`/api/admin/offers/${priceDraft.id}`, "PATCH", { base_price: priceDraft.price.trim() ? price : null, duration_months: months });
      await refresh(); closePriceEditor();
    } catch (error) { setPriceError(error instanceof Error ? error.message : "Permintaan belum berhasil."); }
    finally { setSavingPrice(false); }
  }

  async function updateAvailability(row: PriceRow, status: string) {
    if (updatingAvailability) return;
    setUpdatingAvailability(true);
    try {
      await commercialWrite(`/api/admin/offers/${row.id}`, "PATCH", { status });
      await refresh(); setMessage("Ketersediaan paket disimpan. Status Journey tidak berubah.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ketersediaan gagal disimpan."); }
    finally { setUpdatingAvailability(false); }
  }

  const previewPlan = landingOffers.find(plan => plan.subTitle === editingPrice?.mode);
  const previewPrice = priceDraft?.price.trim() && Number.isSafeInteger(Number(priceDraft.price)) && Number(priceDraft.price) >= 0 && Number(priceDraft.price) <= 2147483647 ? Number(priceDraft.price) : null;
  const previewEffective = previewPrice === null ? null : Math.max(0, previewPrice - Math.round(previewPrice * (editingPrice?.percentage ?? 0) / 100));

  return <AdminShell current="/admin/program-harga"><main className="admin-public-prototype">
    <AdminPageHeader title="Harga & Promo" description={notice} />
    <p role="status">{message}</p>
    {loadError && <div role="alert"><p>{loadError}</p><button type="button" className="button" disabled={loading} onClick={() => void load()}>Coba lagi</button></div>}
    <AdminSection title="Harga program" description="Program Journey atau penawaran yang nonaktif tidak ditawarkan kepada pengunjung. Harga kosong berarti belum ditentukan, bukan gratis." actions={<Link className="button button-secondary" href="/admin/kurikulum-materi?tab=Program">Kelola Program</Link>}>
      <AdminFilterToolbar><label className="admin-prototype-search"><LuSearch aria-hidden="true" /><input aria-label="Cari program" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Cari program atau cara belajar" /></label></AdminFilterToolbar>
      <AdminDataTable loading={loading} caption="Harga dan pratinjau promo" rows={priceRows.filter((row) => `${row.code} ${row.program} ${row.mode}`.toLowerCase().includes(filter.trim().toLowerCase()))} rowKey={(row) => row.id} columns={[
        { key: "program", header: "Program", cell: row => <div><strong>{row.program}</strong><br /><small>Journey: {statusLabel(row.programStatus)}</small></div> },
        { key: "mode", header: "Cara Belajar", cell: row => row.mode },
        { key: "duration", header: "Durasi", cell: row => `${row.months} bulan` },
        { key: "price", header: "Harga", cell: row => <div>{row.price !== null && row.effective !== null && row.effective < row.price && <><s>{formatProgramPrice(row.price)}</s><br /></>}<strong>{formatProgramPrice(row.effective ?? row.price)}</strong></div> },
        { key: "status", header: "Ketersediaan Paket", cell: row => <label className="admin-field"><select aria-label={`Ketersediaan ${row.program} ${row.mode}`} value={row.status} disabled={updatingAvailability} onChange={event => void updateAvailability(row, event.target.value)}>{row.status === "draft" && <option value="draft">Draft</option>}<option value="active">Bisa Dibeli</option><option value="inactive">Tidak Ditawarkan</option></select>{row.status === "active" && (row.programStatus !== "active" || row.price === null) && <small>Belum bisa dibeli: Journey nonaktif atau harga belum ditentukan.</small>}</label> },
      ]} actions={{ header: "Tindakan", cell: row => <button type="button" className="button" onClick={() => { setPriceError(""); setPriceDraft({ id: row.id, price: row.price === null ? "" : String(row.price), months: String(row.months) }); }} aria-label={`Edit Harga ${row.program} ${row.mode}`}>Edit Harga</button> }} />
    </AdminSection>
    <AdminDialog open={Boolean(priceDraft)} title="Edit Harga" close={closePriceEditor} actions={<><button type="button" className="button" disabled={savingPrice} onClick={closePriceEditor}>Batal</button><button type="submit" form="admin-price-editor" className="button button-primary" disabled={savingPrice}>Simpan Harga</button></>}>
      {priceDraft && editingPrice && <form id="admin-price-editor" className="admin-prototype-form admin-price-editor" onSubmit={savePrice} noValidate>
        <p><strong>{editingPrice.program} ({editingPrice.code})</strong></p>
        <p>Cara belajar: {editingPrice.mode}</p>
        <label className="admin-field">Harga Normal (Rp)<input type="number" min="0" max="2147483647" step="1" value={priceDraft.price} onChange={event => setPriceDraft({ ...priceDraft, price: event.target.value })} /><small>Kosongkan jika harga belum tersedia. Nilai 0 berarti gratis.</small></label>
        <label className="admin-field">Durasi (bulan)<input type="number" min="1" max="32767" step="1" value={priceDraft.months} onChange={event => setPriceDraft({ ...priceDraft, months: event.target.value })} required /></label>
        <AdminSection title="Pratinjau Kartu Program">
          <div className="admin-price-card-preview">
            {previewPlan && <LandingPriceCard offer={previewPlan} price={previewEffective} normalPrice={previewPrice} months={priceDraft.months} preview />}
          </div>
          <small>Pratinjau mengikuti promo aktif saat data dimuat. Harga akhir dihitung backend saat pemesanan. Perubahan belum disimpan.</small>
        </AdminSection>
        {priceError && <p role="alert">{priceError}</p>}

      </form>}
    </AdminDialog>
    <AdminSection title="Promo" actions={<button type="button" className="button button-primary" disabled={loading || Boolean(loadError) || promoBusy || !eligiblePrices.length} onClick={() => edit()}>Tambah promo</button>}>
      <AdminDataTable loading={loading} caption="Promo sesi ini" rows={promos} rowKey={(row) => row.id} empty="Belum ada promo. Tambahkan promo untuk mencoba pratinjau diskon." columns={[
        { key: "name", header: "Nama promo", cell: (row) => row.name },
        { key: "program", header: "Program", cell: (row) => { const price = priceRows.find((item) => item.id === row.priceId); return `${price?.program} — ${price?.mode}`; } },
        { key: "percentage", header: "Diskon", cell: (row) => `${row.percentage}%` },
        { key: "start", header: "Tanggal mulai", cell: (row) => row.start },
        { key: "end", header: "Tanggal akhir", cell: (row) => row.end },
        { key: "note", header: "Catatan", cell: (row) => row.note || "—" },
        { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.status} /> },
      ]} actions={{ cell: (row) => <div className="admin-page-actions"><button type="button" className="button" disabled={promoBusy} onClick={() => edit(row)} aria-label={`Edit promo ${row.name}`}>Edit</button><button type="button" className="button" disabled={promoBusy} onClick={() => { setConfirmError(""); setPending({ promo: row, action: "toggle" }); }} aria-label={`${row.status === "Aktif" ? "Nonaktifkan" : "Aktifkan"} promo ${row.name}`}>{row.status === "Aktif" ? "Nonaktifkan" : "Aktifkan"}</button><button type="button" className="button" disabled={promoBusy} onClick={() => { setConfirmError(""); setPending({ promo: row, action: "delete" }); }} aria-label={`Hapus promo ${row.name}`}>Hapus</button></div> }} />
    </AdminSection>
    <AdminDialog open={Boolean(draft)} title={draft?.id ? "Edit promo" : "Tambah promo"} close={closeEditor}>
      {draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
        <label className="admin-field">Nama promo<input placeholder="Contoh: Promo Semangat Belajar" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
        <label className="admin-field">Program dan cara belajar<select value={draft.priceId} onChange={(event) => setDraft({ ...draft, priceId: event.target.value })}>{eligiblePrices.map((row) => <option key={row.id} value={row.id}>{row.program} — {row.mode} — {row.months} bulan</option>)}</select></label>
        <label className="admin-field">Persentase diskon<input placeholder="Contoh: 10" type="number" min="0" max="100" step="any" value={draft.percentage} onChange={(event) => setDraft({ ...draft, percentage: event.target.value })} required /></label>
        <label className="admin-field">Tanggal mulai<input type="date" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label>
        <label className="admin-field">Tanggal akhir<input type="date" min={draft.start || undefined} value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label>
        <label className="admin-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PromoStatus })}>{promoStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label className="admin-field">Catatan (opsional)<textarea placeholder="Contoh: Promo untuk pendaftaran program yang dipilih selama periode ini." value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
        <AdminSection title="Pratinjau perhitungan"><p>Harga normal: {selectedPrice && selectedPrice.price !== null ? rupiah(selectedPrice.price) : "Harga belum ditentukan"}</p><p>Diskon: {selectedPrice && selectedPrice.price !== null && validPercentage ? rupiah(Math.round(selectedPrice.price * percentage / 100)) : "Isi persentase yang valid"}</p><p>Harga promosi: {selectedPrice && selectedPrice.price !== null && validPercentage ? rupiah(selectedPrice.price - Math.round(selectedPrice.price * percentage / 100)) : "Belum tersedia"}</p><p>Pratinjau perhitungan tidak mengaktifkan promo dan tidak mengubah harga dasar.</p></AdminSection>
        {error && <p role="alert">{error}</p>}
        <div className="admin-page-actions"><button type="button" className="button" disabled={promoBusy} onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary" disabled={promoBusy}>Simpan promo</button></div>
      </form>}
    </AdminDialog>
    <AdminConfirmDialog open={Boolean(pending)} title={pending?.action === "delete" ? "Hapus promo?" : "Ubah status promo?"} close={closeConfirmation} actions={<><button type="button" className="button" disabled={promoBusy} onClick={closeConfirmation}>Batal</button><button type="button" className="button button-primary" disabled={promoBusy} onClick={confirm}>Konfirmasi</button></>}><p>{pending?.promo.name}: {pending?.action === "delete" ? "promo akan dihapus dari sesi ini." : pending?.promo.status === "Aktif" ? "promo akan dinonaktifkan." : "promo akan diaktifkan."} Harga dasar tidak berubah.</p>{confirmError && <p role="alert">{confirmError}</p>}</AdminConfirmDialog>
  </main></AdminShell>;
}
