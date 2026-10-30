"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { HeroBannerSlider } from "@/components/hero-banner-slider";
import { ApiError } from "@/lib/api";
import { uploadAdminMedia, adminMediaUrl } from "@/lib/admin-media";
import { initialLandingContent } from "@/lib/admin-website-store";
import { fetchLandingHero, publishLandingHero, saveLandingHero, type LandingHero, type LandingHeroState } from "@/lib/landing-hero-api";
import { sliderSlides, type HeroSliderConfig, type HeroSliderSlide } from "@/lib/hero-slider";
import styles from "./landing-hero-editor.module.css";
import { colorHeadline } from "@/lib/headline-highlights";

function configuration(hero: LandingHero): HeroSliderConfig {
  return hero.slider ?? { autoplay: true, intervalMs: 6000, slides: [{
    id: "hiru-hero-01", internalTitle: "Banner Utama JLPT", order: 0, active: true,
    desktopSrc: "/banners/hiru-hero-desktop.png", mobileSrc: "", imageAlt: "Dua pelajar bahasa Jepang dengan latar Gunung Fuji, sakura, dan gerbang torii",
    eyebrow: hero.eyebrow, title: hero.heading, description: hero.support,
    showOverlay: true, showPrimary: true, primaryLabel: hero.primaryCtaLabel, primaryHref: hero.primaryCtaPath,
    showSecondary: true, secondaryLabel: hero.secondaryCtaLabel, secondaryHref: hero.secondaryCtaPath,
    desktopPosition: "left", mobilePosition: "left", offsetY: 0,
  }] };
}

export function LandingHeroEditor() {
  const { user, loading: authLoading } = useAuth();
  const [server, setServer] = useState<LandingHeroState | null>(null);
  const [hero, setHero] = useState<LandingHero>(initialLandingContent.hero);
  const [config, setConfig] = useState(() => configuration(initialLandingContent.hero));
  const [selected, setSelected] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [tab, setTab] = useState("Isi banner");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const locked = useRef(false);
  const headline = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLElement>(null);
  const builder = useRef<HTMLElement>(null);
  const previewFrame = useRef<HTMLDivElement>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [mobilePreviewZoom, setMobilePreviewZoom] = useState(1);
  const previewReady = server !== null;
  useEffect(() => {
    const frame = previewFrame.current;
    if (!frame) return;
    const update = () => {
      const compact = window.innerWidth < 1024;
      const height = compact ? (window.innerHeight <= 550 ? 56 : expanded ? 280 : 112) : window.innerHeight * 0.4;
      setPreviewZoom(Math.min(frame.clientWidth / 1440, compact ? height / 480 : 1));
      setMobilePreviewZoom(Math.min(1, frame.clientWidth / 360, height / 800));
    };
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    window.addEventListener("resize", update);
    update();
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [previewReady, expanded]);
  useEffect(() => {
    const studio = builder.current?.closest<HTMLElement>(".landing-page-studio");
    const viewport = window.visualViewport;
    if (!studio || !viewport) return;
    const update = () => {
      if (window.innerWidth < 1024) studio.style.setProperty("--studio-height", `${viewport.height}px`);
      else studio.style.removeProperty("--studio-height");
    };
    viewport.addEventListener("resize", update);
    update();
    return () => { viewport.removeEventListener("resize", update); studio.style.removeProperty("--studio-height"); };
  }, []);
  const slide = config.slides[selected];
  const baseline = server && configuration(server.draft ?? server.published ?? initialLandingContent.hero);
  const dirty = !!baseline && JSON.stringify(config) !== JSON.stringify(baseline);
  const publishedConfig = server?.published ? configuration(server.published) : null;
  const accept = useCallback((state: LandingHeroState) => {
    const next = state.draft ?? state.published ?? initialLandingContent.hero;
    setServer(state); setHero(next); setConfig(configuration(next)); setSelected(0); setConflict(false);
  }, []);
  useEffect(() => {
    if (authLoading || user?.role !== "admin") return;
    let active = true;
    fetchLandingHero().then(state => { if (active) accept(state); }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, user?.role, accept]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function patch(value: Partial<HeroSliderSlide>) {
    setConfig(current => ({ ...current, slides: current.slides.map((item, index) => index === selected ? { ...item, ...value } : item) })); setMessage("");
  }
  function formatHeadline(orange: boolean) {
    const input = headline.current;
    if (!input) return;
    const start = Array.from(input.value.slice(0, input.selectionStart)).length;
    const end = Array.from(input.value.slice(0, input.selectionEnd)).length;
    if (start === end) { setMessage("Pilih bagian judul yang ingin diubah warnanya."); input.focus(); return; }
    patch({ titleHighlights: colorHeadline(slide.titleHighlights ?? [], start, end, orange) });
    input.focus();
  }
  function arrange(slides: HeroSliderSlide[], index: number) {
    setConfig(current => ({ ...current, slides: slides.map((item, order) => ({ ...item, order })) })); setSelected(index);
  }
  async function upload(file: File | undefined, kind: "desktopSrc" | "mobileSrc") {
    if (!file || !slide || locked.current) return;
    const id = slide.id;
    locked.current = true; setUploading(true); setError("");
    try {
      const media = await uploadAdminMedia(file, "image");
      setConfig(current => ({ ...current, slides: current.slides.map(item => item.id === id ? { ...item, [kind]: media.path, [`${kind}_resolved_url`]: media.url } : item) }));
      setMessage(`${file.name} (${Math.round(file.size / 1024)} KB) berhasil diunggah. Klik Simpan perubahan agar gambar tersimpan pada banner ini.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gambar gagal diunggah. Gambar sebelumnya dipertahankan."); }
    finally { locked.current = false; setUploading(false); }
  }
  async function mutate(publish: boolean) {
    if (!server || locked.current || conflict || (publish && (dirty || !server.draft))) return;
    locked.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const state = publish ? await publishLandingHero(server.revision) : await saveLandingHero(server.revision, { ...hero, slider: config });
      accept(state);
      setMessage(publish ? "Banner berhasil ditampilkan di halaman utama." : "Perubahan berhasil disimpan. Klik Tampilkan di halaman utama agar pengunjung melihat perubahan ini.");
    } catch (cause) {
      setConflict(cause instanceof ApiError && cause.status === 409);
      setError(cause instanceof ApiError && cause.status === 409 ? "Pengaturan sudah diubah dari tempat lain. Perubahan Anda masih ada di sini. Klik Ambil pengaturan terbaru sebelum menyimpan lagi." : cause instanceof Error ? cause.message : "Permintaan gagal.");
    } finally { locked.current = false; setBusy(false); }
  }
  if (authLoading) return <p role="status">Memeriksa akses Anda…</p>;
  if (user?.role !== "admin") return <p role="alert">Akses admin diperlukan.</p>;
  const textField = (key: "internalTitle" | "imageAlt" | "eyebrow" | "title" | "description" | "primaryLabel" | "primaryHref" | "secondaryLabel" | "secondaryHref", label: string, limit: number, multiline = false) => <label className={styles.field}><span>{label}</span>{multiline ? <textarea aria-label={label} maxLength={limit} value={slide[key]} onChange={event => patch({ [key]: event.target.value })} /> : <input maxLength={limit} value={slide[key]} onChange={event => patch({ [key]: event.target.value })} />}</label>;
  const toggle = (key: "active" | "showOverlay" | "showPrimary" | "showSecondary", label: string) => <label className={styles.toggle}>{label}<input type="checkbox" checked={slide[key]} onChange={event => patch({ [key]: event.target.checked })} /></label>;
  return <section ref={builder} className={styles.builder} aria-busy={loading || busy || uploading}>
    {loading && <p role="status">Memuat pengaturan banner…</p>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {(conflict || (!server && !loading)) && <button type="button" onClick={async () => { if (dirty && !confirm("Muat ulang akan membuang perubahan belum disimpan. Lanjutkan?")) return; try { accept(await fetchLandingHero()); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Muat ulang gagal."); } }}>Ambil pengaturan terbaru</button>}
    {server && <fieldset disabled={busy || uploading || conflict} className={styles.workspace}>
      <aside className={styles.navigator}>
        <h3>Daftar banner</h3><div className={styles.list}>{config.slides.map((item, index) => <button type="button" key={item.id} aria-pressed={index === selected} onClick={() => setSelected(index)}>{item.desktopSrc && <Image unoptimized src={item.desktopSrc.startsWith("/") ? item.desktopSrc : adminMediaUrl(item.desktopSrc, item.desktopSrc_resolved_url)} alt="" width={64} height={44} />}<span><strong>{item.internalTitle || "Tanpa judul"}</strong><small className={styles.statusLabel}>{publishedConfig?.slides.some(published => published.active && JSON.stringify(published) === JSON.stringify(item)) ? "Published" : "Draf"}</small></span></button>)}</div>
        <button type="button" disabled={config.slides.length >= 20} onClick={() => { const fresh = configuration(initialLandingContent.hero).slides[0]; arrange([...config.slides, { ...fresh, id: crypto.randomUUID(), internalTitle: "Banner baru", active: false, desktopSrc: "" }], config.slides.length); }}>+ Tambah banner</button>
        {slide && <details key={slide.id} className={styles.bannerActions}><summary>Tindakan banner</summary><div className={styles.secondaryActions}>
          <button type="button" aria-label="Pindahkan ke atas" title="Pindahkan ke atas" disabled={selected === 0} onClick={() => { const items = [...config.slides]; [items[selected - 1], items[selected]] = [items[selected], items[selected - 1]]; arrange(items, selected - 1); }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 10 6-6 6 6M12 4v16" /></svg></button>
          <button type="button" aria-label="Pindahkan ke bawah" title="Pindahkan ke bawah" disabled={selected === config.slides.length - 1} onClick={() => { const items = [...config.slides]; [items[selected + 1], items[selected]] = [items[selected], items[selected + 1]]; arrange(items, selected + 1); }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 14 6 6 6-6M12 4v16" /></svg></button>
          <button type="button" aria-label="Buat salinan" title="Buat salinan" disabled={config.slides.length >= 20} onClick={() => { const items = [...config.slides]; items.splice(selected + 1, 0, { ...slide, id: crypto.randomUUID(), internalTitle: `${slide.internalTitle} (Salinan)`, active: false }); arrange(items, selected + 1); }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></svg></button>
          <button type="button" aria-label="Hapus" title="Hapus" onClick={() => { if (confirm("Hapus banner ini? File gambar tetap tersimpan.")) arrange(config.slides.filter((_, index) => index !== selected), Math.max(0, selected - 1)); }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg></button>
        </div></details>}<p>Banner tampil sesuai urutan daftar. Menyimpan perubahan belum mengubah tampilan yang dilihat pengunjung.</p>
      </aside>
      <div className={`${styles.card} ${styles.editor}`}><div className={styles.tabs} role="tablist" aria-label="Pengaturan banner">{["Isi banner", "Tombol", "Tampilan"].map(name => <button key={name} id={`hero-tab-${name.replaceAll(" ", "-")}`} type="button" role="tab" aria-selected={tab === name} aria-controls="hero-editor-panel" onClick={() => setTab(name)} onKeyDown={event => { const names = ["Isi banner", "Tombol", "Tampilan"]; const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0; if (direction) { event.preventDefault(); const next = names[(names.indexOf(name) + direction + names.length) % names.length]; setTab(next); document.getElementById(`hero-tab-${next.replaceAll(" ", "-")}`)?.focus(); } }} tabIndex={tab === name ? 0 : -1}>{name}</button>)}</div>
        {slide && <div className={styles.settings} id="hero-editor-panel" role="tabpanel" aria-labelledby={`hero-tab-${tab.replaceAll(" ", "-")}`} tabIndex={0}>
          <section hidden={tab !== "Isi banner"}><h3>Gambar dan tulisan</h3>
            {(["desktopSrc", "mobileSrc"] as const).map(kind => <div key={`${slide.id}-${kind}`} className={styles.upload}>
              <strong>{kind === "desktopSrc" ? "Banner" : "Banner HP"}</strong><small>Ukuran yang disarankan {kind === "desktopSrc" ? "1920 × 640 px (3:1)" : "1080 × 1350 px (4:5)"}. JPEG, PNG, WebP.</small>
              {slide[kind] && <Image unoptimized src={slide[kind].startsWith("/") ? slide[kind] : adminMediaUrl(slide[kind], slide[`${kind}_resolved_url`])} alt={slide.imageAlt} width={200} height={90} onLoad={event => { const image = event.currentTarget; const expected = kind === "desktopSrc" ? 3 : .8; image.nextElementSibling!.textContent = `${image.naturalWidth} × ${image.naturalHeight} px${Math.abs(image.naturalWidth / image.naturalHeight / expected - 1) > .1 ? " · Bentuk gambar berbeda dari saran; sebagian gambar mungkin terpotong" : ""}`; }} />}<small key={slide[kind] || "empty"} aria-live="polite" />
              {slide[kind] && <><button type="button" aria-label={`Hapus gambar ${kind === "desktopSrc" ? "komputer" : "HP"}`} onClick={() => patch({ [kind]: "", [`${kind}_resolved_url`]: undefined })}>Hapus gambar</button><small>Hanya melepas gambar dari banner ini, bukan menghapus file. Klik Simpan perubahan agar pilihan ini tersimpan.</small></>}
              <label>Ganti / unggah gambar<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void upload(event.target.files?.[0], kind); event.target.value = ""; }} /></label>
            </div>)}
            {textField("internalTitle", "Nama banner (hanya untuk pengelola)", 160)}{textField("imageAlt", "Keterangan gambar (untuk pembaca layar)", 300)}{textField("eyebrow", "Tulisan pendek di atas judul", 160)}<label className={styles.field}><span>Judul pada banner</span><textarea ref={headline} aria-label="Judul pada banner" aria-describedby="headline-color-help" maxLength={300} value={slide.title} onChange={event => patch({ title: event.target.value, titleHighlights: [] })} /></label><p id="headline-color-help">Pilih bagian judul, lalu klik Oranye. Jika isi judul diubah, semua warna judul kembali seperti semula.</p><div><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => formatHeadline(true)}>Oranye</button><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => formatHeadline(false)}>Kembalikan warna</button></div>{textField("description", "Penjelasan di bawah judul", 1000, true)}{toggle("showOverlay", "Tampilkan tulisan pada gambar")}
          </section>
          <section hidden={tab !== "Tombol"}><h3>Tombol</h3><p>Tombol hanya dapat membuka halaman atau bagian di situs ini. Contoh tujuan: /register atau #harga. Tautan ke situs lain tidak diperbolehkan.</p>
            {toggle("showPrimary", "Tampilkan tombol utama")}{textField("primaryLabel", "Tulisan tombol utama", 80)}{textField("primaryHref", "Tujuan tombol utama", 255)}
            {toggle("showSecondary", "Tampilkan tombol tambahan")}{textField("secondaryLabel", "Tulisan tombol tambahan", 80)}{textField("secondaryHref", "Tujuan tombol tambahan", 255)}
            {(["ctaOffsetDesktop", "ctaOffsetMobile"] as const).map(key => <label className={styles.field} key={key}>Geser tombol kiri/kanan ({key === "ctaOffsetDesktop" ? "komputer" : "HP"}): {slide[key] ?? 0}%<input type="range" min={-100} max={100} step={1} value={slide[key] ?? 0} onChange={event => patch({ [key]: Number(event.target.value) })} /></label>)}<p>Negatif ke kiri, positif ke kanan. Kedua tombol bergeser bersama tanpa menggeser judul. Gerakan berhenti di batas aman banner; 0% kembali ke posisi awal.</p>
          </section>
          <section hidden={tab !== "Tampilan"}><h3>Tampilan banner</h3>
            {(["desktopPosition", "mobilePosition"] as const).map(key => <label className={styles.field} key={key}>Posisi tulisan & tombol di {key === "desktopPosition" ? "komputer" : "HP"}<select value={slide[key]} onChange={event => patch({ [key]: event.target.value as HeroSliderSlide[typeof key] })}><option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option></select></label>)}
            <label className={styles.field}>Geser tulisan & tombol naik/turun (komputer): {slide.offsetY}%<input type="range" min={-10} max={10} value={slide.offsetY} onChange={event => patch({ offsetY: Number(event.target.value) })} /></label><button type="button" disabled={slide.offsetY === 0} onClick={() => patch({ offsetY: 0 })}>Kembalikan ke 0%</button>
            <p>Nilai negatif menggeser ke atas, positif ke bawah. 0% berarti posisi awal. Pengaturan ini hanya untuk tampilan komputer.</p>
            <label className={styles.field}>Jeda pergantian banner (detik)<input type="number" min={3} max={60} step={1} value={config.intervalMs / 1000} onChange={event => setConfig(current => ({ ...current, intervalMs: Number(event.target.value) * 1000 }))} /></label><p>Contoh: 6 detik berarti banner berganti setiap 6 detik. Berlaku jika pergantian otomatis aktif dan ada lebih dari satu banner aktif.</p>
            {slide && <div className={styles.previewOptions}>{toggle("active", "Sertakan banner ini di halaman utama")}<p>Centang agar banner ini ikut tampil. Perubahan baru dilihat pengunjung setelah disimpan dan ditampilkan di halaman utama.</p><label className={styles.toggle}>Ganti banner otomatis<input type="checkbox" checked={config.autoplay} onChange={event => setConfig(current => ({ ...current, autoplay: event.target.checked }))} /></label><p>Berlaku jika lebih dari satu banner dipilih untuk tampil. Pada contoh di atas, gunakan panah untuk mengganti banner.</p></div>}
          </section>
        </div>}

      </div>
        <section className={`${styles.card} ${styles.previewPanel} ${expanded ? styles.expanded : ""}`} ref={preview} tabIndex={-1}><div className={styles.heading}><div><h3>Contoh tampilan banner</h3><button className={styles.expandButton} type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Perkecil contoh tampilan" : "Perbesar contoh tampilan"}</button><p>Contoh perubahan Anda sebelum ditampilkan kepada pengunjung.</p></div><div><button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button><button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button></div></div>
          <div className={styles.previewFrame} ref={previewFrame}><div className={mobile ? styles.mobilePreview : styles.desktopPreview} style={{ zoom: mobile ? mobilePreviewZoom : previewZoom }}>
            {slide?.desktopSrc ? <HeroBannerSlider key={`${slide.id}-${mobile}`} slides={sliderSlides({ ...config, slides: [slide, ...config.slides.filter(item => item.id !== slide.id && item.desktopSrc)] }, true)} autoplay={false} /> : <p>Unggah gambar komputer untuk melihat contoh tampilan.</p>}
          </div></div>{slide && !slide.mobileSrc && <p role="status">Belum ada gambar khusus HP. Tampilan HP memakai gambar komputer; tulisan tetap ditampilkan terpisah.</p>}

        </section>
        <footer className={styles.actions}>{(dirty || uploading) && <p role="status">{dirty && "Perubahan belum disimpan."} {uploading && "Gambar sedang diunggah…"}</p>}<div><button type="button" onClick={() => void mutate(false)}>Simpan perubahan</button><button type="button" disabled={dirty || !server.draft} onClick={() => void mutate(true)}>Tampilkan di halaman utama</button></div></footer>
    </fieldset>}
  </section>;
}
