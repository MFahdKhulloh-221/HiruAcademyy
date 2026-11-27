"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LuAward, LuCircleCheck, LuX } from "react-icons/lu";
import { achievementNotices, dismissAchievementNotice, type Achievement } from "@/lib/program-achievement-api";
import styles from "./program-achievement.module.css";

export function AchievementNotice() {
  const pathname = usePathname();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [achievement, setAchievement] = useState<Achievement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const dismissed = useRef(new Set<number>());

  useEffect(() => {
    const controller = new AbortController();
    // ponytail: activity pages opt in only after saved completion or rendered results.
    const chapterOverview = /^\/learn\/[^/]+\/chapter-\d+$/.test(pathname);
    const activityPage = !chapterOverview && /^\/(learn|tryout|checkpoint|placement|flashcards)(\/|$)/.test(pathname);
    async function load(event?: Event) {
      if (activityPage && !event) return;
      try {
        const notices = await achievementNotices(controller.signal);
        const programId = event instanceof CustomEvent ? event.detail?.programId : undefined;
        if (!controller.signal.aborted) setAchievement(notices.find(item => !dismissed.current.has(item.id) && (!programId || item.program_id === programId)) ?? null);
      } catch { /* Notification delivery must not affect learning writes. */ }
    }
    void load();
    const ready = (event: Event) => { void load(event); };
    window.addEventListener("hiru:achievement-ready", ready);
    return () => { controller.abort(); window.removeEventListener("hiru:achievement-ready", ready); };
  }, [pathname]);

  useEffect(() => {
    if (!achievement) return;
    const element = dialog.current;
    if (!element?.open) element?.showModal();
    return () => element?.close();
  }, [achievement]);

  async function dismiss(openCertificate = false) {
    if (!achievement || pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try {
      await dismissAchievementNotice(achievement.id);
      dismissed.current.add(achievement.id);
      dialog.current?.close();
      setAchievement(null);
      if (openCertificate) router.push(`/certificate/${achievement.id}`);
    } catch {
      setError("Pemberitahuan belum berhasil ditutup. Silakan coba lagi.");
    } finally { pending.current = false; setBusy(false); }
  }

  if (!achievement) return null;
  const summary = achievement.completion_summary;
  return <dialog ref={dialog} className={styles.modal} aria-labelledby="achievement-title" aria-describedby="achievement-description" onCancel={event => { event.preventDefault(); void dismiss(); }}>
    <button className={styles.close} type="button" aria-label="Tutup pencapaian" disabled={busy} onClick={() => void dismiss()}><LuX aria-hidden="true" /></button>
    <span className={styles.medal}><LuAward aria-hidden="true" /></span>
    <p className={styles.eyebrow}>PENCAPAIAN BARU</p>
    <h2 id="achievement-title">Selamat atas pencapaianmu!</h2>
    <p id="achievement-description">Kamu telah berhasil menyelesaikan seluruh perjalanan belajar {achievement.program_name_snapshot}.</p>
    <section className={styles.summary} aria-label="Ringkasan pencapaian">
      <h3><LuAward aria-hidden="true" />{achievement.presentation_snapshot.title || `Sertifikat Penyelesaian ${achievement.program_name_snapshot}`}</h3>
      <span className={styles.success}><LuCircleCheck aria-hidden="true" />Berhasil diperoleh</span>
      <dl><div><dt>Chapter selesai</dt><dd>{summary.completed_chapters} dari {summary.total_chapters}</dd></div><div><dt>Aktivitas wajib</dt><dd>{summary.required_activities_complete ? "100% selesai" : "—"}</dd></div></dl>
    </section>
    <p>Sertifikatmu sudah tersedia dan dapat diunduh melalui halaman Sertifikat.</p>
    {error && <p role="alert">{error}</p>}
    <div className={styles.actions}><button className="button button-primary" type="button" disabled={busy} onClick={() => void dismiss(true)}>Lihat Sertifikat Saya</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => void dismiss()}>Nanti saja</button></div>
  </dialog>;
}
