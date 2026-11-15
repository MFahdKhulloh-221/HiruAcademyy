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
import { StudentTopbar } from "@/components/student-topbar";
import { ApiError } from "@/lib/api";
import { learningMembership, programSlug } from "@/lib/learning-api";
import { LuAward, LuArrowRight, LuBookOpen, LuCircleCheck, LuClipboardCheck, LuLockKeyhole } from "react-icons/lu";
import centerStyles from "./student-certificate-center.module.css";
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
  empty_program: "Program belum memiliki materi yang siap diperiksa.",
  empty_chapter: "Masih ada bagian program yang belum memiliki tugas wajib untuk diperiksa.",
  invalid_content: "Materi program belum siap diperiksa. Silakan hubungi tim HiruAcademy.",
  inactive_program: "Program ini sedang tidak aktif. Silakan hubungi tim HiruAcademy.",
};

export function StudentCertificateCenter({ level }: { level?: string }) {
  const { user } = useAuth();
  const catalog = useLearningCatalog();
  const [page, setPage] = useState(1);
  const purchaseDialog = useRef<HTMLDialogElement>(null);
  const purchaseTrigger = useRef<HTMLButtonElement | null>(null);
  const [lockedProgram, setLockedProgram] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [notice, setNotice] = useState<{ identity: typeof user; title: string; message: string; achievementId?: number; success?: boolean } | null>(null);
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
      const success = result.reason === "issued" || result.reason === "existing";
      setNotice({ identity: user, title: result.reason === "issued" ? "Sertifikat berhasil diterbitkan" : result.reason === "existing" ? "Sertifikat sudah tersedia" : result.reason === "incomplete" ? "Belum memenuhi syarat" : "Status penyelesaian", message: reasonMessages[result.reason] ?? "Status penyelesaian belum dapat dipastikan. Silakan muat ulang daftar.", achievementId: success ? result.data?.id : undefined, success });
      request.retry();
    } catch (cause) {
      setNotice({ identity: user, title: "Pemeriksaan belum berhasil", message: cause instanceof ApiError && cause.status === 429 ? "Terlalu banyak permintaan. Silakan coba lagi nanti." : "Pemeriksaan penyelesaian belum berhasil. Silakan coba lagi." });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const rows = request.data?.data.filter(item => !level || item.program_code_snapshot?.toLowerCase() === level.toLowerCase()) ?? [];
  const visibleNotice = notice?.identity?.id === user?.id ? notice : null;
  const journeyPrograms = catalog.data?.programs ?? [];
  return <section className={centerStyles.page} aria-label="Pusat sertifikat">
    <header className={centerStyles.header}><h1>Sertifikat Digital</h1><p>Semua pencapaian belajarmu tersimpan di satu tempat. Sertifikat akan tersedia setelah syarat penyelesaian program terpenuhi.</p></header>
    {level && <p className={centerStyles.filter}>Program: {level.toUpperCase()}. Filter berlaku pada halaman daftar saat ini. <Link href="/certificate">Lihat semua sertifikat</Link></p>}
    <div className={centerStyles.layout}>
      <div className={centerStyles.collection}>
        {request.loading ? <div className={centerStyles.card} role="status">Memuat sertifikat…</div> : request.error ? <div className={centerStyles.card}><p role="alert">Daftar sertifikat belum berhasil dimuat.</p><button type="button" className={centerStyles.secondary} onClick={request.retry}>Coba Lagi Sertifikat</button></div> : <>
          {rows.length ? <section aria-label="Sertifikat yang diterbitkan" className={centerStyles.issued}><h2>Sertifikatmu</h2><div className={centerStyles.certificateGrid}>{rows.map(achievement => <div className={centerStyles.certificateCard} key={achievement.id}><DigitalAchievementCard achievement={achievement} /><Link className={centerStyles.secondary} href={`/certificate/${achievement.id}`}>Lihat Sertifikat <LuArrowRight aria-hidden="true" /></Link></div>)}</div></section> : request.data?.meta.total === 0 ? <section className={`${centerStyles.card} ${centerStyles.empty}`}>
            <div className={centerStyles.illustration} aria-hidden="true"><LuAward /><span><LuCircleCheck /></span></div>
            <span className={centerStyles.badge}>Belum ada sertifikat diterbitkan</span><h2>Pencapaianmu sedang dipersiapkan</h2><p>Lanjutkan program dan selesaikan tugas wajib. Setelah itu, periksa penyelesaian untuk memperoleh sertifikat.</p><Link className={centerStyles.primary} href="/journey">Lanjutkan Belajar <LuArrowRight aria-hidden="true" /></Link>
          </section> : <section className={centerStyles.card}><h2>Belum ada sertifikat yang sesuai</h2><p>Tidak ada sertifikat untuk filter atau halaman ini.</p><Link className={centerStyles.secondary} href="/certificate">Lihat semua sertifikat</Link></section>}
          {!!rows.length && request.data && request.data.meta.last_page > 1 && <nav className={centerStyles.pagination} aria-label="Halaman sertifikat"><button type="button" className={centerStyles.secondary} disabled={request.data.meta.current_page <= 1 || busy} onClick={() => setPage(request.data!.meta.current_page - 1)}>Sebelumnya</button><span>Halaman {request.data.meta.current_page} dari {request.data.meta.last_page}</span><button type="button" className={centerStyles.secondary} disabled={request.data.meta.current_page >= request.data.meta.last_page || busy} onClick={() => setPage(request.data!.meta.current_page + 1)}>Berikutnya</button></nav>}
        </>}
      </div>
      <section className={`${centerStyles.card} ${centerStyles.check}`} aria-label="Periksa penyelesaian program">
        <div className={centerStyles.checkHeading}><span className={centerStyles.icon}><LuClipboardCheck aria-hidden="true" /></span><div><h2>Periksa Penyelesaian</h2><p>Cek status sertifikat programmu</p></div></div>
        {catalog.error ? <><p role="alert">Daftar program belum berhasil dimuat.</p><button type="button" className={centerStyles.secondary} onClick={catalog.retry}>Coba Lagi Program</button></> : catalog.loading ? <p role="status">Memuat program…</p> : programs.length ? <div className={centerStyles.form}>
          <label>Program<select value={selected?.id ?? ""} onChange={event => { setSelectedProgram(event.target.value); setNotice(null); }} disabled={busy}><option value="">Pilih program</option>{programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
          <button type="button" className={centerStyles.primary} disabled={!selected || busy} onClick={() => void refresh()}>{busy ? "Memeriksa…" : "Periksa Penyelesaian"}</button>
        </div> : <p>Belum ada program dengan akses penuh untuk diperiksa.</p>}
        <div role="status" aria-atomic="true">{visibleNotice && <div className={`${centerStyles.notice} ${visibleNotice.success ? centerStyles.success : ""}`}><strong>{visibleNotice.title}</strong><p>{visibleNotice.message}</p>{visibleNotice.achievementId && <Link href={`/certificate/${visibleNotice.achievementId}`}>Lihat Sertifikat <LuArrowRight aria-hidden="true" /></Link>}</div>}</div>
        <div className={centerStyles.guide}><h3>Cara mendapatkan sertifikat</h3><ol><li><span>1</span><div><h4>Ikuti pembelajaran</h4><p>Pelajari materi program yang kamu ikuti.</p></div></li><li><span>2</span><div><h4>Selesaikan tugas wajib</h4><p>Pastikan seluruh aktivitas wajib selesai.</p></div></li><li><span>3</span><div><h4>Periksa penyelesaian</h4><p>Periksa kelayakan penerbitan sertifikat.</p></div></li></ol></div>
      </section>
    </div>
    <section className={centerStyles.journey} aria-label="Perjalanan belajarmu"><h2>Perjalanan belajarmu</h2><p>Lanjutkan program yang dapat kamu akses.</p>{catalog.error ? <p>Program belum berhasil dimuat. Coba muat ulang daftar program.</p> : catalog.loading ? <p role="status">Memuat perjalanan belajar…</p> : journeyPrograms.length ? <div className={centerStyles.programGrid}>{journeyPrograms.map(program => <article className={`${centerStyles.card} ${catalog.data!.access.learning[program.code] !== "full" ? centerStyles.lockedCard : ""}`} key={program.id}><span className={centerStyles.icon}>{catalog.data!.access.learning[program.code] === "full" ? <LuBookOpen aria-hidden="true" /> : <LuLockKeyhole aria-hidden="true" />}</span><span className={centerStyles.access}>{catalog.data!.access.learning[program.code] === "full" ? "Akses penuh" : "Terkunci"}</span><h3>{program.name}</h3><p>{catalog.data!.access.learning[program.code] === "full" ? "Program tersedia untuk dipelajari." : "Program ini belum termasuk dalam akses membershipmu."}</p>{catalog.data!.access.learning[program.code] === "full" ? <Link className={centerStyles.secondary} href={`/journey/${encodeURIComponent(programSlug(program.code))}`}>Buka Program <LuArrowRight aria-hidden="true" /></Link> : <button className={centerStyles.secondary} type="button" aria-haspopup="dialog" onClick={event => { purchaseTrigger.current = event.currentTarget; setLockedProgram(program.code); purchaseDialog.current?.showModal(); }}><LuLockKeyhole aria-hidden="true" /> Buka Program</button>}</article>)}</div> : <div className={centerStyles.card}><p>Belum ada program yang dapat diakses.</p><Link className={centerStyles.secondary} href="/journey">Lihat Program <LuArrowRight aria-hidden="true" /></Link></div>}</section>
    <dialog ref={purchaseDialog} className={centerStyles.purchaseDialog} aria-labelledby="certificate-program-lock-title" onClose={() => purchaseTrigger.current?.focus()}>
      <span className={centerStyles.icon}><LuLockKeyhole aria-hidden="true" /></span>
      <h2 id="certificate-program-lock-title">Anda belum memiliki program ini</h2>
      <p>Beli membership untuk membuka akses program ini.</p>
      <div className={centerStyles.dialogActions}><form method="dialog"><button className={centerStyles.secondary} type="submit" autoFocus>Batal</button></form><Link className={centerStyles.primary} href={`/renewal?target=${encodeURIComponent(lockedProgram)}`} onClick={() => purchaseDialog.current?.close()}>Beli membership</Link></div>
    </dialog>
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
  return <div className="supporting-shell student-shell"><StudentNavigation membership={learningMembership(catalog.data.access)} /><div className="supporting-body"><StudentTopbar membership={learningMembership(catalog.data.access)} /><main className="supporting-main"><StudentBreadcrumb items={[{ label: "Sertifikat", href: "/certificate" }, { label: achievementId ? "Detail" : level?.toUpperCase() ?? "Daftar" }]} />{achievementId ? <AchievementDetail achievementId={achievementId} /> : <StudentCertificateCenter level={level} />}</main></div></div>;
}
