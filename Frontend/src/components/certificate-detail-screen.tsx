"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DigitalAchievementCard } from "@/components/digital-achievement-card";
import { CertificateDocument } from "@/components/certificate-document";
import { downloadCertificatePdf } from "@/lib/certificate-pdf";
import { useLearningCatalog, useLearningRequest } from "@/components/learning-hooks";
import { StudentBreadcrumb } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";
import { ApiError } from "@/lib/api";
import { learningMembership } from "@/lib/learning-api";
import { reconcileAchievement, studentAchievement, studentAchievements } from "@/lib/program-achievement-api";
import styles from "@/components/digital-achievement-card.module.css";

const reasonMessages: Record<string, string> = {
  issued: "Sertifikat berhasil diterbitkan.",
  existing: "Sertifikat program ini sudah diterbitkan.",
  policy_unresolved: "Kebijakan penyelesaian program belum tersedia.",
  incomplete: "Kriteria penyelesaian program belum terpenuhi.",
  learning_type_unresolved: "Jenis pembelajaran belum dapat diverifikasi.",
  disabled: "Penerbitan otomatis program ini belum diaktifkan.",
  issuance_conflict: "Status penerbitan berubah. Muat ulang daftar untuk memeriksa sertifikat.",
  reconciliation_failed: "Status penyelesaian belum dapat diperiksa. Silakan coba lagi.",
  media_reference_unresolved: "Tampilan sertifikat belum siap diterbitkan.",
  deferred: "Pemeriksaan penyelesaian ditunda. Silakan coba lagi nanti.",
  deferred_until_commit: "Pemeriksaan penyelesaian ditunda. Silakan coba lagi nanti.",
  not_found: "Program tidak ditemukan atau tidak dapat diakses.",
};

export function StudentCertificateCenter({ level }: { level?: string }) {
  const { user } = useAuth();
  const catalog = useLearningCatalog();
  const [page, setPage] = useState(1);
  const [selectedProgram, setSelectedProgram] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [notice, setNotice] = useState<{ identity: typeof user; message: string } | null>(null);
  const load = useCallback((signal: AbortSignal) => studentAchievements(page, signal), [page]);
  const request = useLearningRequest(load, `achievements:${page}`);
  const programs = catalog.data?.programs.filter(program => catalog.data?.access.learning[program.code] === "full") ?? [];
  const selected = programs.find(program => String(program.id) === selectedProgram);
  async function refresh() {
    if (!selected || pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = await reconcileAchievement(selected.id);
      setNotice({ identity: user, message: reasonMessages[result.reason] ?? "Status penyelesaian belum dapat dipastikan. Silakan muat ulang daftar." });
      request.retry();
    } catch (cause) {
      setNotice({ identity: user, message: cause instanceof ApiError && cause.status === 429 ? "Terlalu banyak permintaan. Silakan coba lagi nanti." : "Pemeriksaan penyelesaian belum berhasil. Silakan coba lagi." });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const rows = request.data?.data.filter(item => !level || item.program_code_snapshot?.toLowerCase() === level.toLowerCase()) ?? [];
  return <section className={styles.page} aria-label="Pusat sertifikat">
    <header className="supporting-header"><p className="dash-kicker">CERTIFICATE CENTER</p><h1>Sertifikat digital</h1><p>Sertifikat yang telah diterbitkan setelah penyelesaian seluruh tugas wajib program yang dipublikasikan terverifikasi.</p></header>
    {level && <p>Program: {level.toUpperCase()}. Filter berlaku pada halaman daftar saat ini. <Link className={styles.link} href="/certificate">Lihat semua sertifikat</Link></p>}
    <section aria-label="Periksa penyelesaian program">
      <h2>Periksa penyelesaian</h2>
      {catalog.error ? <><p role="alert">Daftar program belum berhasil dimuat.</p><button type="button" className={`button ${styles.link}`} onClick={catalog.retry}>Coba Lagi Program</button></> : catalog.loading ? <p role="status">Memuat program…</p> : programs.length ? <div className={styles.controls}>
        <label>Program<select value={selected?.id ?? ""} onChange={event => setSelectedProgram(event.target.value)} disabled={busy}><option value="">Pilih program</option>{programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
        <button type="button" className="button button-primary" disabled={!selected || busy} onClick={() => void refresh()}>{busy ? "Memeriksa…" : "Periksa Penyelesaian"}</button>
      </div> : <p>Belum ada program dengan akses penuh untuk diperiksa.</p>}
      <p role="status">{notice?.identity?.id === user?.id ? notice?.message : ""}</p>
    </section>
    {request.loading ? <p role="status">Memuat sertifikat…</p> : request.error ? <><p role="alert">Daftar sertifikat belum berhasil dimuat.</p><button type="button" className={`button ${styles.link}`} onClick={request.retry}>Coba Lagi Sertifikat</button></> : <>
      {rows.length ? <div className={styles.grid}>{rows.map(achievement => <div key={achievement.id}><DigitalAchievementCard achievement={achievement} /><Link className={`button ${styles.link}`} href={`/certificate/${achievement.id}`}>Lihat Detail Sertifikat</Link></div>)}</div> : <section className="library-empty"><h2>Belum ada sertifikat yang diterbitkan{level ? " untuk program ini pada halaman ini" : " pada halaman ini"}</h2><p>Selesaikan seluruh tugas wajib program yang dipublikasikan, lalu periksa penyelesaian.</p><Link className={`button button-primary ${styles.link}`} href="/journey">Lanjutkan Belajar</Link></section>}
      {request.data && <nav className={styles.controls} aria-label="Halaman sertifikat"><button type="button" className="button" disabled={request.data.meta.current_page <= 1 || busy} onClick={() => setPage(request.data!.meta.current_page - 1)}>Sebelumnya</button><span>Halaman {request.data.meta.current_page} dari {request.data.meta.last_page}</span><button type="button" className="button" disabled={request.data.meta.current_page >= request.data.meta.last_page || busy} onClick={() => setPage(request.data!.meta.current_page + 1)}>Berikutnya</button></nav>}
    </>}
  </section>;
}

function AchievementDetail({ achievementId }: { achievementId: number }) {
  const load = useCallback(async (signal: AbortSignal) => {
    try { return await studentAchievement(achievementId, signal); }
    catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) throw new ApiError(404, {}, "Sertifikat tidak ditemukan atau tidak dapat diakses.");
      throw cause;
    }
  }, [achievementId]);
  const request = useLearningRequest(load, `achievement:${achievementId}`);
  const documentRef = useRef<HTMLDivElement>(null);
  const downloadLock = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  async function download() {
    const svg = documentRef.current?.querySelector("svg");
    if (!svg || !request.data || downloadLock.current) return;
    downloadLock.current = true;
    setDownloading(true); setDownloadError("");
    try { await downloadCertificatePdf(svg, `HiruAcademy-${request.data.program_code_snapshot || "sertifikat"}.pdf`); }
    catch { setDownloadError("PDF belum berhasil dibuat. Silakan coba lagi."); }
    finally { downloadLock.current = false; setDownloading(false); }
  }
  const achievement = request.data;
  return <section className={styles.page}><h1>Detail Sertifikat</h1>{request.loading ? <p role="status">Memuat sertifikat…</p> : request.error ? <><p role="alert">{request.error}</p><button type="button" className={`button ${styles.link}`} onClick={request.retry}>Coba Lagi</button></> : achievement && <>
    <div ref={documentRef}><CertificateDocument studentName={achievement.student_name_snapshot ?? ""} programName={achievement.program_name_snapshot ?? ""} title={achievement.presentation_snapshot.title ?? ""} description={achievement.presentation_snapshot.description ?? ""} issuedAt={achievement.issued_at ?? ""} signatureDataUrl={achievement.presentation_snapshot.signature_data_url} signaturePosition={achievement.presentation_snapshot.signature_position} /></div>
    <button type="button" className="button button-primary" disabled={downloading} onClick={() => void download()}>{downloading ? "Menyiapkan PDF…" : "Unduh PDF"}</button>
    {downloadError && <p role="alert">{downloadError}</p>}
    <p>Sertifikat ini merupakan bukti penyelesaian program, bukan kelulusan JLPT atau ujian akhir.</p>
    <section aria-label="Achievement digital"><h2>Achievement</h2><p>Kartu pencapaian digital, terpisah dari dokumen sertifikat.</p><DigitalAchievementCard achievement={achievement} /></section>
  </>}<Link className={`button ${styles.link}`} href="/certificate">Kembali ke Sertifikat</Link></section>;
}

export function CertificateDetailScreen({ level, achievementId }: { level?: string; achievementId?: number } = {}) {
  const catalog = useLearningCatalog();
  if (!catalog.data) return <main className="supporting-main">{catalog.error ? <><p role="alert">Daftar program belum berhasil dimuat.</p><button type="button" className={`button ${styles.link}`} onClick={catalog.retry}>Coba Lagi</button></> : <p role="status">Memuat…</p>}</main>;
  return <div className="supporting-shell student-shell"><StudentNavigation membership={learningMembership(catalog.data.access)} /><main className="supporting-main"><StudentBreadcrumb items={[{ label: "Sertifikat", href: "/certificate" }, { label: achievementId ? "Detail" : level?.toUpperCase() ?? "Daftar" }]} />{achievementId ? <AchievementDetail achievementId={achievementId} /> : <StudentCertificateCenter level={level} />}</main></div>;
}
