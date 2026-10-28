"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { initialLandingContent } from "@/lib/admin-website-store";
import { fetchLandingHero, isLandingHero, publishLandingHero, saveLandingHero, type LandingHero, type LandingHeroState } from "@/lib/landing-hero-api";

const limits: Record<keyof LandingHero, number> = { eyebrow: 160, heading: 300, support: 1000, primaryCtaLabel: 80, secondaryCtaLabel: 80, primaryCtaPath: 255, secondaryCtaPath: 255 };
const fields: { key: keyof LandingHero; label: string }[] = [
  { key: "eyebrow", label: "Eyebrow Hero" },
  { key: "heading", label: "Judul Hero" },
  { key: "support", label: "Deskripsi Hero" },
  { key: "primaryCtaLabel", label: "Label CTA utama" },
  { key: "primaryCtaPath", label: "Path CTA utama" },
  { key: "secondaryCtaLabel", label: "Label CTA sekunder" },
  { key: "secondaryCtaPath", label: "Path CTA sekunder" },
];

export function LandingHeroEditor() {
  const { user, loading: authLoading } = useAuth();
  const [server, setServer] = useState<LandingHeroState | null>(null);
  const [hero, setHero] = useState<LandingHero>(initialLandingContent.hero);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const locked = useRef(false);
  const dirty = server !== null && JSON.stringify(hero) !== JSON.stringify(server.draft ?? server.published ?? initialLandingContent.hero);

  const accept = useCallback((state: LandingHeroState) => {
    setServer(state);
    setHero(state.draft ?? state.published ?? initialLandingContent.hero);
    setConflict(false);
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (locked.current) return;
    locked.current = true;
    setLoading(true); setError(""); setMessage("");
    try { const state = await fetchLandingHero(signal); if (!signal?.aborted) accept(state); }
    catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Hero gagal dimuat."); }
    finally { locked.current = false; if (!signal?.aborted) setLoading(false); }
  }, [accept]);

  useEffect(() => {
    if (authLoading || user?.role !== "admin") return;
    // The API client deduplicates concurrent reads; ignore responses after unmount.
    let active = true;
    fetchLandingHero().then(state => { if (active) { accept(state); setLoading(false); } }).catch(cause => {
      if (active) { setError(cause instanceof Error ? cause.message : "Hero gagal dimuat."); setLoading(false); }
    });
    return () => { active = false; };
  }, [authLoading, user?.role, accept]);

  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);

  async function mutate(publish: boolean) {
    if (!server || locked.current || conflict || (publish && (dirty || !server.draft))) return;
    locked.current = true; setBusy(true); setError(""); setMessage("");
    try {
      accept(await (publish ? publishLandingHero(server.revision) : saveLandingHero(server.revision, hero)));
      setMessage(publish ? "Hero berhasil dipublikasikan." : "Draft Hero berhasil disimpan.");
    } catch (cause) {
      const stale = cause instanceof ApiError && cause.status === 409;
      setConflict(stale);
      setError(stale ? "Konflik revisi (409). Data server berubah. Muat ulang data server sebelum menyimpan atau memublikasikan lagi." : cause instanceof Error ? cause.message : "Permintaan Hero gagal. Coba lagi.");
    } finally { locked.current = false; setBusy(false); }
  }

  if (authLoading) return <p role="status">Memeriksa sesi admin…</p>;
  if (user?.role !== "admin") return <p role="alert">Akses admin diperlukan.</p>;

  return <section className="program-form-card" aria-labelledby="hero-editor-title" aria-busy={loading || busy}>
    <h2 id="hero-editor-title">Editor Hero</h2>
    <p>Hanya teks dan CTA Hero yang dapat diedit. Bagian Landing Page lainnya tetap dikunci.</p>
    {loading && <p role="status">Memuat Hero…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button type="button" className="button button-secondary" disabled={loading || busy} onClick={() => {
      if (dirty && !window.confirm("Muat ulang data server akan membuang perubahan Hero yang belum disimpan. Lanjutkan?")) return;
      void load();
    }}>Muat ulang data server</button>
    {server && <>
      <p>Revisi server: {server.revision}. {server.published ? "Hero sudah dipublikasikan." : "Hero belum dipublikasikan; halaman publik memakai teks awal."}</p>
      <form onSubmit={event => { event.preventDefault(); void mutate(false); }}>
        <fieldset disabled={loading || busy || conflict} style={{ border: 0, padding: 0, minWidth: 0 }}>
          <div className="form-grid">{fields.map(({ key, label }) => <label className="field" key={key}>
            <span>{label}</span>
            {key === "support" ? <textarea required maxLength={limits[key]} value={hero[key]} onChange={event => { setHero(current => ({ ...current, [key]: event.target.value })); setMessage(""); }} />
              : <input required maxLength={limits[key]} type="text" value={hero[key]} onChange={event => { setHero(current => ({ ...current, [key]: event.target.value })); setMessage(""); }} />}
          </label>)}</div>
          <p className="field-hint">Path CTA harus internal, misalnya /register atau #program. Simpan perubahan terlebih dahulu sebelum publikasi.</p>
          <button className="button button-primary" type="submit" disabled={!isLandingHero(hero) || (!dirty && server.draft !== null)}>Simpan Draft Hero</button>
          <button className="button button-secondary" type="button" disabled={dirty || !server.draft} onClick={() => void mutate(true)}>Publikasikan Hero</button>
        </fieldset>
      </form>
      {dirty && <p role="status">Perubahan belum disimpan. Simpan draft sebelum publikasi.</p>}
      <section aria-labelledby="hero-preview-title" className="program-form-card">
        <h3 id="hero-preview-title">Pratinjau Hero</h3>
        <p>{hero.eyebrow}</p><h4>{hero.heading}</h4><p>{hero.support}</p>
        <p>{hero.primaryCtaLabel} ({hero.primaryCtaPath})</p>
        <p>{hero.secondaryCtaLabel} ({hero.secondaryCtaPath})</p>
        <p className="field-hint">Pratinjau draft saja; belum mengubah halaman publik.</p>
      </section>
    </>}
  </section>;
}
