"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { StudentNavigation } from "@/components/student-navigation";
import { useLearningCatalog } from "@/components/learning-hooks";
import { learningMembership } from "@/lib/learning-api";
import { ApiError, apiRequest } from "@/lib/api";
import { TestimonialFields, TestimonialPreview } from "@/components/testimonial-builder";
import { testimonialVideo, type TestimonialContent } from "@/lib/public-content-api";
import styles from "./testimoni.module.css";

type Kind = "text" | "video";
type Saved = TestimonialContent & { moderation_status: "pending" | "approved" | "rejected"; moderation_note: string | null; consent_public: boolean; archived_at?: string | null };
type Draft = { quote: string; title: string; videoUrl: string; thumbnail: string; thumbnailFile: File | null; consent: boolean };
const empty: Draft = { quote: "", title: "", videoUrl: "", thumbnail: "", thumbnailFile: null, consent: false };
function httpsUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port && !/[\s\\]/.test(decodeURIComponent(value)); } catch { return false; }
}
function validVideo(draft: Draft) {
  const video = testimonialVideo(draft.videoUrl.trim());
  return !!draft.title.trim() && Array.from(draft.title.trim()).length <= 255 && draft.videoUrl.trim().length <= 2048 && httpsUrl(draft.videoUrl.trim()) && !!video && video.kind !== "native" && (draft.thumbnailFile instanceof File);
}
function failure(cause: unknown) {
  return cause instanceof ApiError ? `${cause.message} (${cause.status ? `HTTP ${cause.status}` : "koneksi gagal"})` : "Permintaan gagal. Periksa koneksi dan coba lagi.";
}

export default function StudentTestimonialPage() {
  const { user } = useAuth();
  const catalog = useLearningCatalog();
  const [type, setType] = useState<Kind>("text");
  const [drafts, setDrafts] = useState<Record<Kind, Draft>>({ text: { ...empty }, video: { ...empty } });
  const [history, setHistory] = useState<Partial<Record<Kind, Saved | null>>>({});
  const [context, setContext] = useState("");
  const [loadErrors, setLoadErrors] = useState<Partial<Record<Kind, string>>>({});
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState("");
  const dirty = useRef<Partial<Record<Kind, boolean>>>({});
  const submitting = useRef(false);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    void Promise.all((["text", "video"] as const).map(async kind => {
      try {
        const response = await apiRequest<{ data: Saved | null; context: string }>(`/api/student/testimonial?type=${kind}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setHistory(previous => ({ ...previous, [kind]: response.data }));
        setContext(response.context);
        setLoadErrors(previous => ({ ...previous, [kind]: "" }));
        if (!dirty.current[kind]) {
          const item = response.data;
          setDrafts(previous => ({ ...previous, [kind]: { quote: item?.quote ?? "", title: item?.title ?? "", videoUrl: item?.video_url ?? "", thumbnail: item?.video_thumbnail ?? "", thumbnailFile: null, consent: item?.consent_public ?? false } }));
        }
      } catch (cause) {
        if (!controller.signal.aborted) setLoadErrors(previous => ({ ...previous, [kind]: failure(cause) }));
      }
    })).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user, revision]);

  const draft = drafts[type];
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  useEffect(() => {
    if (!draft.thumbnailFile) { setThumbnailPreview(""); return; }
    const url = URL.createObjectURL(draft.thumbnailFile);
    setThumbnailPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.thumbnailFile]);
  const saved = history[type];
  const locked = saved?.moderation_status === "approved" || !!saved?.archived_at;
  const length = Array.from(draft.quote.trim()).length;
  const valid = !!user && !locked && draft.consent && length <= 500 && (type === "text" ? length >= 20 : validVideo(draft));
  function change(patch: Partial<Draft>) {
    dirty.current[type] = true;
    setDrafts(previous => ({ ...previous, [type]: { ...previous[type], ...patch } }));
    setSuccess("");
    setError("");
    setFieldErrors({});
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(""); setFieldErrors({}); setSuccess("");
    try {
      const payload = { type, quote: draft.quote.trim(), consent_public: true, ...(type === "video" ? { title: draft.title.trim(), video_url: draft.videoUrl.trim() } : {}) };
      let body: string | FormData = JSON.stringify(payload);
      if (type === "video") {
        const file = draft.thumbnailFile;
        if (!(file instanceof File)) {
          setFieldErrors({ video_thumbnail: ["Pilih file thumbnail JPG, JPEG, atau PNG."] });
          return;
        }
        const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
        if (!(/\.jpe?g$/i.test(file.name) && jpeg) && !(/\.png$/i.test(file.name) && png)) {
          setFieldErrors({ video_thumbnail: ["Isi thumbnail harus JPEG atau PNG sesuai ekstensi file. Mengganti nama menjadi .jpg tidak mengubah format gambar."] });
          return;
        }
        body = new FormData();
        for (const [key, value] of Object.entries(payload)) body.append(key, value === true ? "1" : String(value));
        body.append("video_thumbnail", file, file.name);
        body.append("_method", "PUT");
      }
      const { data } = await apiRequest<{ data: Saved }>("/api/student/testimonial", { method: body instanceof FormData ? "POST" : "PUT", body });
      setHistory(previous => ({ ...previous, [type]: data }));
      setContext(data.context);
      setSuccess(type === "video" ? "Testimoni video berhasil dipublikasikan" : "Testimoni berhasil dikirim dan tayang di halaman Testimoni. Landing dipilih Admin.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 422) {
        const { file, video_title, ...fields } = cause.errors;
        setFieldErrors({ ...fields, ...(file || fields.video_thumbnail ? { video_thumbnail: fields.video_thumbnail || file } : {}), ...(video_title || fields.title ? { title: fields.title || video_title } : {}) });
      }
      setError(cause instanceof ApiError && cause.status === 409 ? "Testimoni sudah disetujui dan tidak dapat diubah. Muat ulang histori atau hubungi Admin." : failure(cause));
    } finally { submitting.current = false; setBusy(false); }
  }
  const membership = catalog.data ? learningMembership(catalog.data.access) : "free";
  const preview: TestimonialContent = { id: 0, name: user?.name ?? "", image: user?.avatar ?? null, image_resolved_url: user?.avatar_resolved_url, context, quote: draft.quote || "Komentar pengalaman belajarmu akan tampil di sini.", type, title: draft.title, video_title: draft.title, video_url: draft.videoUrl, video_thumbnail: draft.thumbnail, show_on_testimonials: false };
  return <div className="supporting-shell student-shell"><StudentNavigation membership={membership} /><main className={`supporting-main profile-page ${styles.page}`}>
    <header className={`supporting-heading ${styles.heading}`}><p className="dash-kicker">TESTIMONI SAYA</p><h1>Bagikan Pengalaman Belajarmu</h1><p>Tulis pengalaman atau bagikan video. Testimoni berizin langsung tampil di halaman Testimoni; Landing dipilih Admin.</p></header>
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={save} aria-busy={busy}>
        <p className={styles.identity}><strong>{user?.name}</strong>{context && <> · <span>{context}</span></>} · <Link href={`/profile?membership=${membership}#pengaturan`}>Kelola foto di Profil Saya</Link></p>
        {!context && <p className={styles.note}>Konteks akun akan ditentukan backend saat dikirim. Program tidak diisi manual.</p>}
        {locked && <p role="status">Testimoni sudah disetujui. Hubungi Admin jika ingin melakukan perubahan.</p>}
        <fieldset disabled={busy}>
          <TestimonialFields errors={{ ...fieldErrors, ...(!fieldErrors.video_url && type === "video" && draft.videoUrl && (!httpsUrl(draft.videoUrl.trim()) || !testimonialVideo(draft.videoUrl.trim()) || testimonialVideo(draft.videoUrl.trim())?.kind === "native") ? { video_url: ["URL video tidak valid. Gunakan tautan HTTPS YouTube, Instagram, atau Google Drive."] } : {}) }} value={{ ...preview, quote: draft.quote }} disabled={busy} fieldsDisabled={locked} student onThumbnailFile={file => {
            change({ thumbnailFile: file });
            if (file && (!/\.(jpe?g|png)$/i.test(file.name) || (file.type && !["image/png", "image/jpeg"].includes(file.type)))) {
              setDrafts(previous => ({ ...previous, video: { ...previous.video, thumbnailFile: null } }));
              setFieldErrors({ video_thumbnail: ["Pilih file JPG, JPEG, atau PNG asli."] });
            }
          }} onChange={patch => {
            if (patch.type) { setType(patch.type); setError(""); setFieldErrors({}); setSuccess(""); }
            else change({ ...(patch.quote !== undefined ? { quote: patch.quote } : {}), ...(patch.title !== undefined ? { title: patch.title || "" } : {}), ...(patch.video_url !== undefined ? { videoUrl: patch.video_url || "" } : {}), ...(patch.video_thumbnail !== undefined ? { thumbnail: patch.video_thumbnail || "" } : {}) });
          }} />
          <label className={styles.consent}><span>Saya mengizinkan publikasi testimoni beserta nama, foto profil, dan konteks akun saya di halaman Testimoni.</span><input type="checkbox" disabled={locked} checked={draft.consent} onChange={event => change({ consent: event.target.checked })} required aria-invalid={!!fieldErrors.consent_public?.length} aria-describedby={fieldErrors.consent_public?.length ? "testimonial-consent-error" : undefined} /></label>
          {fieldErrors.consent_public?.length && <small id="testimonial-consent-error" role="alert">{fieldErrors.consent_public.join(" ")}</small>}
        </fieldset>
        {error && <p role="alert">{error}</p>}{success && <p role="status">{success}</p>}
        <button className="button button-primary" type="submit" disabled={busy || !valid}>{busy ? "Mengirim…" : "Kirim Testimoni"}</button>
      </form>
      <div className={styles.preview}><TestimonialPreview value={preview} thumbnailPreview={thumbnailPreview} /></div>
    </div>
    <section className={styles.history} aria-labelledby="history-heading"><h2 id="history-heading">Testimoni yang sudah dikirim</h2>{loading && <p role="status">Memuat histori…</p>}{Object.entries(loadErrors).filter(([, message]) => message).map(([kind, message]) => <p role="alert" key={kind}>Histori {kind === "text" ? "tertulis" : "video"} gagal dimuat: {message} <button className="button" type="button" disabled={busy} onClick={() => { setLoading(true); setRevision(value => value + 1); }}>Coba lagi</button></p>)}
      {Object.entries(history).map(([kind, item]) => item && <article key={kind} className={styles.historyItem}><div className={styles.historyHeader}><h3>{kind === "text" ? "Testimoni Tertulis" : "Testimoni Video"}</h3><span className={`${styles.badge} ${item.moderation_status === "approved" ? styles.badgeApproved : item.moderation_status === "pending" ? styles.badgePending : styles.badgeRejected}`}>{item.archived_at ? "Arsip" : item.published && item.show_on_testimonials ? "Tayang" : item.moderation_status === "approved" ? "Disembunyikan" : item.moderation_status === "pending" ? "Menunggu peninjauan Admin" : "Perlu perbaikan"}</span></div>{item.moderation_note && <p className={styles.historyNote}>Catatan Admin: {item.moderation_note}</p>}<p className={styles.historyQuote}>{item.title || item.quote}</p></article>)}
      {!loading && !Object.values(loadErrors).some(Boolean) && !Object.values(history).some(Boolean) && <p className={styles.emptyHistory}>Belum ada testimoni yang dikirim.</p>}
    </section>
  </main></div>;
}
