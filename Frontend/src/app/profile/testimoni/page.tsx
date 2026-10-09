"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { StudentAvatar } from "@/components/student-avatar";
import { StudentNavigation } from "@/components/student-navigation";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useLearningCatalog } from "@/components/learning-hooks";
import { learningMembership } from "@/lib/learning-api";
import { ApiError, apiRequest } from "@/lib/api";

type Testimonial = {
  id: number | string;
  name: string;
  context: string;
  quote: string;
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
    apiRequest<{ data: Testimonial | null }>("/api/student/testimonial", { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setTestimonial(data);
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
  }, [version]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || locked) return;
    const length = Array.from(quote.trim()).length;
    if (!context.trim() || Array.from(context.trim()).length > 255 || length < 20 || length > 500 || !consent) {
      setError("Isi program / pengalaman belajar, kutipan 20–500 karakter, dan izin publikasi.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await apiRequest<{ data: Testimonial }>("/api/student/testimonial", { method: "PUT", body: JSON.stringify({ context: context.trim(), quote: quote.trim(), consent_public: true }) });
      setTestimonial(data);
      setContext(data.context);
      setQuote(data.quote);
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
  const status = locked ? "Disetujui" : testimonial?.moderation_status === "pending" ? "Menunggu Review" : testimonial?.moderation_status === "rejected" ? "Perlu Perbaikan" : "";
  return <div className="supporting-shell student-shell"><StudentNavigation membership={learningMembership(catalog.data.access)} /><main className="supporting-main profile-page student-testimonial-page">
    <header className="supporting-heading"><p className="dash-kicker">TESTIMONI SAYA</p><h1>Bagikan pengalamanmu belajar bersama Hiru Academy.</h1></header>
    <section className="profile-identity"><StudentAvatar name={user?.name ?? ""} url={user?.avatar_resolved_url} className="profile-avatar" /><div><h2>{user?.name}</h2><p>{user?.email}</p><p>Foto ini mengikuti foto profil akunmu.</p><Link className="button button-secondary" href="/profile#pengaturan">Ubah Foto Profil</Link></div></section>
    {loading ? <LoadingSkeleton variant="form" label="Memuat testimoni…" /> : loadError ? <div role="alert">{loadError} <button type="button" className="button" onClick={() => { setLoading(true); setVersion(value => value + 1); }}>Coba lagi</button></div> : <form className="profile-settings-card student-testimonial-form" onSubmit={save} aria-busy={busy}>
      {status && <div role="status"><strong>{status}</strong>{locked ? <p>{approvedMessage}</p> : testimonial?.moderation_status === "pending" ? <p>Testimonimu sedang diperiksa oleh tim Hiru Academy.</p> : testimonial?.moderation_note && <><h2>Catatan Admin</h2><p>{testimonial.moderation_note}</p></>}</div>}
      <label>Nama<input value={user?.name ?? ""} readOnly /></label>
      <label>Program / Pengalaman Belajar<input placeholder="Contoh: JLPT N4" value={context} onChange={event => setContext(event.target.value)} required maxLength={255} readOnly={locked} disabled={busy} /></label>
      <label>Ceritakan Pengalamanmu<textarea placeholder="Contoh: Materi N4 mudah saya ikuti dan latihan soal membantu saya lebih percaya diri menghadapi JLPT." value={quote} onChange={event => setQuote(event.target.value)} required minLength={20} maxLength={500} readOnly={locked} disabled={busy} aria-describedby="testimonial-count" /></label>
      <small id="testimonial-count">{Array.from(quote).length}/500 karakter · 20–500</small>
      <label className="student-testimonial-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required disabled={locked || busy} /><span>Saya mengizinkan Hiru Academy menampilkan testimoni ini secara publik beserta nama, foto profil, dan informasi program saya.</span></label>
      {error && <p role="alert" className="profile-settings-error">{error}</p>}
      {!locked && <button className="button button-primary" type="submit" disabled={busy}>{!testimonial ? "Kirim Testimoni" : testimonial.moderation_status === "rejected" ? "Kirim Ulang" : "Perbarui Testimoni"}</button>}
    </form>}
  </main></div>;
}
