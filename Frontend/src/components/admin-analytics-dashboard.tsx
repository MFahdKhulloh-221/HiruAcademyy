"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LuArrowUpRight, LuChartColumn, LuClock, LuEye, LuUsers, LuMousePointer2 } from "react-icons/lu";
import { useLearningRequest } from "@/components/learning-hooks";
import { apiRequest, ApiError } from "@/lib/api";
import {
  AdminMetricCard,
  AdminPageHeader,
  AdminShell,
} from "@/components/admin-primitives";
import styles from "./admin-analytics-dashboard.module.css";

type AnalyticsReport = {
  period: "7d" | "30d";
  metrics: { activeUsers: number; sessions: number; screenPageViews: number; averageEngagementSeconds: number };
};
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

type RealtimeReport = {
  windowMinutes: number;
  refreshedAt: string;
  metrics: { activeUsers: number; screenPageViews: number };
};

function RealtimeSummary() {
  const [report, setReport] = useState<RealtimeReport | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const load = async () => {
      if (disposed || document.hidden || controller) return;
      clearTimeout(timer);
      const current = new AbortController();
      controller = current;
      setLoading(true);
      try {
        const response = await apiRequest<{ data: RealtimeReport }>("/api/admin/analytics/realtime", { signal: current.signal });
        const data = response.data;
        if (data?.windowMinutes !== 30 || !Number.isFinite(Date.parse(data.refreshedAt)) || !data.metrics || ![data.metrics.activeUsers, data.metrics.screenPageViews].every(value => Number.isSafeInteger(value) && value >= 0)) throw new ApiError(502);
        if (!current.signal.aborted) {
          setReport(data);
          setLastSuccess(data.refreshedAt);
          setError(false);
        }
      } catch {
        if (!current.signal.aborted) {
          setReport(null);
          setError(true);
        }
      } finally {
        controller = null;
        if (!disposed) {
          setLoading(false);
          if (!document.hidden) timer = setTimeout(load, 15_000);
        }
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.hidden) controller?.abort();
      else void load();
    };
    refresh.current = () => { void load(); };
    document.addEventListener("visibilitychange", visibility);
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visibility);
      refresh.current = () => {};
    };
  }, []);

  return <section className={styles.realtime} aria-labelledby="realtime-title" aria-busy={loading}>
    <header className={styles.sectionHeader}>
      <div><h2 id="realtime-title" className={styles.liveTitle}>Aktivitas Realtime</h2><p>Ringkasan aktivitas selama 30 menit terakhir</p></div>
      <span className={styles.window}>30 MENIT TERAKHIR</span>
    </header>
    <div className={styles.realtimeMetrics}>
      <div><LuUsers className={styles.metricIcon} aria-hidden="true" /><AdminMetricCard label="Pengguna Aktif" value={report ? number.format(report.metrics.activeUsers) : "—"} detail="Pengguna aktif realtime" /></div>
      <div><LuEye className={styles.metricIcon} aria-hidden="true" /><AdminMetricCard label="Tayangan Halaman" value={report ? number.format(report.metrics.screenPageViews) : "—"} detail="Page views realtime" /></div>
    </div>
    {error && <p role="alert">Realtime tidak tersedia. Tanda — bukan nol kunjungan.</p>}
    <div className={styles.realtimeFooter}><p role="status">{loading ? "Memuat Realtime…" : lastSuccess ? <>Terakhir berhasil mengambil laporan: <time dateTime={lastSuccess}>{new Date(lastSuccess).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</time> (bukan waktu aktivitas terbaru).</> : "Belum ada laporan Realtime."}</p>
    <button className={styles.retry} type="button" disabled={loading} onClick={() => refresh.current()}>Perbarui Realtime</button></div>
  </section>;
}

export function AdminAnalyticsDashboard() {
  const [period, setPeriod] = useState<AnalyticsReport["period"]>("30d");
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await apiRequest<{ data: AnalyticsReport }>(`/api/admin/analytics?period=${period}`, { signal });
      const report = response.data;
      if (report?.period !== period || !report.metrics || ![report.metrics.activeUsers, report.metrics.sessions, report.metrics.screenPageViews, report.metrics.averageEngagementSeconds].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) throw new ApiError(502);
      return report;
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) throw new ApiError(503, {}, "Akses laporan GA4 melalui backend belum tersedia. Autentikasi Google Analytics Data API perlu dikonfigurasi dengan aman atau layanan sedang tidak tersedia.");
      throw error;
    }
  }, [period]);
  const request = useLearningRequest(load, `ga4-${period}`);
  const metrics = request.data?.metrics;
  const value = (amount: number | undefined) => amount === undefined ? "—" : number.format(amount);
  return (
    <AdminShell current="/admin/analitik">
      <main className={`admin-page ${styles.page}`}>
        <AdminPageHeader
          title="Analitik"
          description="Pantau kunjungan dan aktivitas pengunjung HiruAcademy."
          actions={<span className={styles.source}>Sumber: GA4</span>}
        />
        <RealtimeSummary />
        <section className={styles.summary} aria-labelledby="summary-title">
          <header className={styles.sectionHeader}>
            <div><h2 id="summary-title">Ringkasan Kunjungan</h2><p>Performa situs dalam {period === "7d" ? "7" : "30"} hari terakhir</p></div>
            <fieldset className={styles.period}>
              <legend className="sr-only">Periode laporan</legend>
              {(["7d", "30d"] as const).map(item => <button key={item} type="button" aria-pressed={period === item} onClick={() => setPeriod(item)}>{item === "7d" ? "7 Hari" : "30 Hari"}</button>)}
            </fieldset>
          </header>
          <section className={styles.metrics} aria-label="Metrik utama Google Analytics" aria-busy={request.loading}>
            <div><LuUsers className={styles.metricIcon} aria-hidden="true" /><AdminMetricCard label="Pengguna Aktif" value={value(metrics?.activeUsers)} detail="jumlah pengguna yang berinteraksi" /></div>
            <div><LuMousePointer2 className={styles.metricIcon} aria-hidden="true" /><AdminMetricCard label="Sesi Kunjungan" value={value(metrics?.sessions)} detail="total sesi pengunjung" /></div>
            <div><LuEye className={styles.metricIcon} aria-hidden="true" /><AdminMetricCard label="Tayangan Halaman" value={value(metrics?.screenPageViews)} detail="jumlah halaman yang dilihat" /></div>
            <div><LuClock className={styles.metricIcon} aria-hidden="true" /><AdminMetricCard label="Rata-rata Engagement" value={metrics ? `${value(metrics.averageEngagementSeconds)} dtk` : "—"} detail="rata-rata waktu engagement aktif" /></div>
          </section>
          {!request.loading && !request.error && metrics && Object.values(metrics).every(amount => amount === 0) && <div className={styles.empty} role="status"><strong>Data laporan periode ini belum tersedia</strong><p>GA4 Realtime dapat menampilkan aktivitas lebih awal daripada laporan standar.</p></div>}

        {request.loading && <p role="status">Memuat laporan Google Analytics…</p>}
        {request.error && <section className={styles.unavailable} aria-labelledby="analytics-unavailable-title">
          <span className={styles.icon} aria-hidden="true"><LuChartColumn /></span>
          <h2 id="analytics-unavailable-title">Laporan GA4 belum tersedia di panel ini</h2>
          <p role="alert">{request.error}</p>
          <p className={styles.note}>Tanda — berarti data belum tersedia, bukan nol kunjungan. Konfigurasi pelacakan bukan bukti bahwa Google Analytics telah menerima data.</p>
          <button className={styles.retry} type="button" onClick={request.retry}>Coba lagi</button>
        </section>}
          <details className={styles.explanation}>
            <summary>Kenapa data Realtime dan ringkasan bisa berbeda?</summary>
            <ul>
              <li>Realtime menampilkan aktivitas selama 30 menit terakhir, terpisah dari ringkasan standar 7 atau 30 hari.</li>
              <li>Laporan standar GA4 dapat memerlukan 24–48 jam untuk memproses data. Angka nol tidak selalu berarti tidak ada aktivitas.</li>
              <li>Realtime diperbarui otomatis setiap 15 detik saat tab terlihat; cache maksimal 15 detik. Ringkasan standar disimpan dalam cache selama 5 menit.</li>
              <li>Data Google dapat terlambat, bukan jaminan aktivitas langsung. Waktu pembaruan menunjukkan laporan terakhir berhasil diambil, bukan aktivitas terbaru.</li>
            </ul>
          </details>
        </section>

        <footer className={styles.details}>
          <div>
            <h2>Lihat Laporan Lebih Lengkap</h2>
            <p>Tren kunjungan, sumber traffic, dan halaman populer dapat dilihat di Google Analytics.</p>
          </div>
          <a
            className={styles.link}
            href="https://analytics.google.com/analytics/web/#/p558392393/reports/intelligenthome"
            target="_blank"
            rel="noopener noreferrer"
          >
            Buka Google Analytics <LuArrowUpRight aria-hidden="true" />
            <span className="sr-only"> (tab baru)</span>
          </a>
        </footer>
      </main>
    </AdminShell>
  );
}
