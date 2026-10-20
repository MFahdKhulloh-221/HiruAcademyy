"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { ProfileIdentity } from "@/components/profile-identity";
import { StudentNavigation } from "@/components/student-navigation";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useLearningCatalog } from "@/components/learning-hooks";
import { learningMembership } from "@/lib/learning-api";
import { ApiError, apiRequest } from "@/lib/api";
import { TestimonialVideoCard } from "@/components/testimonial-video-card";
import { testimonialVideo } from "@/lib/public-content-api";

function httpsUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !/[\s\\]/.test(value); } catch { return false; }
}

type Testimonial = {
  id: number | string;
  name: string;
  context: string;
  quote: string;
  type: "text" | "video";
  title: string;
  video_url: string;
  video_thumbnail: string;
  moderation_status: "pending" | "approved" | "rejected";
  moderation_note: string | null;
  consent_public: boolean;
  published: boolean;
  created_at: string;
  updated_at: string;
};
const approvedMessage = "Testimoni kamu sudah disetujui. Hubungi admin jika ingin melakukan perubahan.";

export default function StudentTestimonialPage() {
  const { user } = useAuth();
  const catalog = useLearningCatalog();
  const [testimonial, setTestimonial] = useState<Testimonial | null>(null);
  const [type, setType] = useState<"text" | "video">("text");
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [context, setContext] = useState("");
  const [quote, setQuote] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [version, setVersion] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ data: Testimonial | null }>(`/api/student/testimonial?type=${type}`, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setTestimonial(data);
      setTitle(data?.title ?? "");
      setVideoUrl(data?.video_url ?? "");
      setThumbnail(data?.video_thumbnail ?? "");
      setContext(data?.context ?? "");
      setQuote(data?.quote ?? "");
      setConsent(data?.consent_public ?? false);
      setLocked(data?.moderation_status === "approved");
      setLoadError("");
      setLoading(false);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setLoadError(cause instanceof Error ? cause.message : "Testimoni gagal dimuat.");
      setLoading(false);
    });
    return () => controller.abort();
  }, [version, type]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || locked) return;
    if (loading || loadError) return;
    const length = Array.from(quote.trim()).length;
    if (type === "video" && (!title.trim() || Array.from(title.trim()).length > 255 || !httpsUrl(videoUrl.trim()) || !testimonialVideo(videoUrl.trim()) || testimonialVideo(videoUrl.trim())?.kind === "native" || (!httpsUrl(thumbnail.trim()) || !/\.(jpe?g|png|webp)$/i.test(new URL(thumbnail.trim()).pathname) || Boolean(new URL(thumbnail.trim()).port)))) {
      setError("Judul, URL video HTTPS, dan thumbnail HTTPS wajib diisi."); return;
    }
    if (!context.trim() || Array.from(context.trim()).length > 255 || (type === "text" && length < 20) || length > 500 || !consent) {
      setError(type === "text" ? "Isi program / pengalaman belajar, kutipan 20–500 karakter, dan izin publikasi." : "Isi program / pengalaman belajar, deskripsi maksimal 500 karakter, dan izin publikasi.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await apiRequest<{ data: Testimonial }>("/api/student/testimonial", { method: "PUT", body: JSON.stringify({ type, context: context.trim(), quote: quote.trim(), consent_public: true, ...(type === "video" ? { title: title.trim(), video_url: videoUrl.trim(), video_thumbnail: thumbnail.trim() } : {}) }) });
      setTestimonial(data);
      setContext(data.context);
      setQuote(data.quote ?? "");
      setConsent(data.consent_public);
      setLocked(data.moderation_status === "approved");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setLocked(true);
        setError("Testimoni yang sudah disetujui tidak dapat diedit. Hubungi admin jika ingin melakukan perubahan.");
      } else setError(cause instanceof Error ? cause.message : "Testimoni gagal disimpan.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (!catalog.data) return <main className="supporting-main">{catalog.error ? <p role="alert">{catalog.error}</p> : <LoadingSkeleton variant="profile" label="Memuat…" />}{catalog.error && <button type="button" onClick={catalog.retry}>Coba Lagi</button>}</main>;
  const membership = learningMembership(catalog.data.access);
  const status = locked ? "Disetujui" : testimonial?.moderation_status === "pending" ? "Menunggu Review" : testimonial?.moderation_status === "rejected" ? "Perlu Perbaikan" : "";
  return <div className="supporting-shell student-shell"><StudentNavigation membership={membership} /><main className="supporting-main profile-page student-testimonial-page">
    <header className="supporting-heading"><p className="dash-kicker">TESTIMONI SAYA</p><h1>Bagikan pengalamanmu belajar bersama Hiru Academy.</h1></header>
    <ProfileIdentity note="Foto ini mengikuti foto profil akunmu."><Link className="button button-secondary" href={`/profile?membership=${membership}#pengaturan`}>Ubah Foto Profil</Link></ProfileIdentity>
    <div className="admin-page-actions" role="tablist" aria-label="Jenis testimoni" onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || busy) return; event.preventDefault(); const next = event.key === "Home" ? "text" : event.key === "End" ? "video" : type === "text" ? "video" : "text"; document.getElementById(`student-testimonial-tab-${next}`)?.click(); document.getElementById(`student-testimonial-tab-${next}`)?.focus(); }}>{(["text", "video"] as const).map(value => <button type="button" className={`button${type === value ? " button-primary" : ""}`} role="tab" id={`student-testimonial-tab-${value}`} aria-controls="student-testimonial-panel" aria-selected={type === value} tabIndex={type === value ? 0 : -1} disabled={busy} key={value} onClick={() => { if (value === type) return; setLoading(true); setError(""); setLoadError(""); setType(value); }}>{value === "text" ? "Testimoni Tertulis" : "Testimoni Video"}</button>)}</div>
    <section role="tabpanel" id="student-testimonial-panel" aria-labelledby={`student-testimonial-tab-${type}`}>
    {loading ? <LoadingSkeleton variant="form" label="Memuat testimoni…" /> : loadError ? <div role="alert">{loadError} <button type="button" className="button" onClick={() => { setLoading(true); setVersion(value => value + 1); }}>Coba lagi</button></div> : <form className="profile-settings-card student-testimonial-form" onSubmit={save} aria-busy={busy}>
      {status && <div role="status"><strong>{status}</strong>{locked ? <p>{approvedMessage}</p> : testimonial?.moderation_status === "pending" ? <p>Testimonimu sedang diperiksa oleh tim Hiru Academy.</p> : testimonial?.moderation_note && <><h2>Catatan Admin</h2><p>{testimonial.moderation_note}</p></>}</div>}
      <label>Nama<input value={user?.name ?? ""} readOnly /></label>
      <label>Program / Pengalaman Belajar<input placeholder="Contoh: JLPT N4" value={context} onChange={event => setContext(event.target.value)} required maxLength={255} readOnly={locked} disabled={busy} /></label>
      {type === "video" && <><label>Judul video<input value={title} onChange={event => setTitle(event.target.value)} required maxLength={255} readOnly={locked} disabled={busy} /></label><label>URL video<input type="url" value={videoUrl} onChange={event => setVideoUrl(event.target.value)} required readOnly={locked} disabled={busy} /></label><label>Platform video<input readOnly value={({ youtube: "YouTube", instagram: "Instagram", drive: "Google Drive", native: "" })[testimonialVideo(videoUrl.trim())?.kind ?? "native"]} /></label><label>Thumbnail<input type="url" value={thumbnail} onChange={event => setThumbnail(event.target.value)} required readOnly={locked} disabled={busy} /></label></>}
      <label>{type === "video" ? "Deskripsi pengalaman (opsional)" : "Ceritakan Pengalamanmu"}<textarea placeholder="Contoh: Materi N4 mudah saya ikuti dan latihan soal membantu saya lebih percaya diri menghadapi JLPT." value={quote} onChange={event => setQuote(event.target.value)} required={type === "text"} minLength={type === "text" ? 20 : undefined} maxLength={500} readOnly={locked} disabled={busy} aria-describedby="testimonial-count" /></label>
      <small id="testimonial-count">{Array.from(quote).length}/500 karakter{type === "text" ? " · 20–500" : ""}</small>
      <label className="student-testimonial-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required disabled={locked || busy} /><span>Saya mengizinkan Hiru Academy menampilkan testimoni ini secara publik beserta nama, foto profil, dan informasi program saya.</span></label>
      {type === "video" && httpsUrl(thumbnail.trim()) && httpsUrl(videoUrl.trim()) && testimonialVideo(videoUrl.trim()) && testimonialVideo(videoUrl.trim())?.kind !== "native" && <TestimonialVideoCard title={title} name={user?.name ?? ""} context={context} description={quote} videoUrl={videoUrl} thumbnail={thumbnail} />}
      {error && <p role="alert" className="profile-settings-error">{error}</p>}
      {!locked && <button className="button button-primary" type="submit" disabled={busy}>{!testimonial ? "Kirim Testimoni" : testimonial.moderation_status === "rejected" ? "Kirim Ulang" : "Perbarui Testimoni"}</button>}
    </form>}
    </section>
  </main></div>;
}
