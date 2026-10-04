"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useLearningRequest } from "@/components/learning-hooks";
import { loadCanonicalAnalytics } from "@/lib/canonical-analytics";
import {
  AdminBreadcrumb,
  AdminEmptyState,
  AdminMetricCard,
  AdminPageHeader,
  AdminSection,
  AdminShell,
  AdminStatusBadge,
  AdminTabs,
} from "@/components/admin-primitives";
import {
  type AnalyticsData,
  type AnalyticsPeriod,
  type Distribution,
} from "@/lib/admin-analytics";

const tabs = ["Ringkasan", "Akuisisi", "Pembelajaran", "Transaksi"] as const;
const periods: readonly { label: string; value: AnalyticsPeriod }[] = [
  { label: "7 Hari", value: "7d" },
  { label: "30 Hari", value: "30d" },
  { label: "Semua", value: "all" },
];
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function DistributionList({ rows, value = false }: { rows: readonly Distribution[]; value?: boolean }) {
  const visible = rows.filter((row) => row.count > 0 || (row.value ?? 0) > 0);
  const maximum = Math.max(0, ...visible.map((row) => value ? row.value ?? 0 : row.count));
  if (!visible.length) return <AdminEmptyState title="Belum ada data" description="Belum ada data untuk bagian dan periode ini." />;
  return <ul className="analytics-distribution">{visible.map((row) => {
    const amount = value ? row.value ?? 0 : row.count;
    return <li key={row.label}><div><strong>{row.label}</strong><span>{row.count} data{value ? ` · ${rupiah.format(amount)}` : ""}</span></div><div className="analytics-bar" aria-hidden="true"><span style={{ width: `${maximum ? Math.max(4, amount / maximum * 100) : 0}%` }} /></div></li>;
  })}</ul>;
}

function Summary({ data }: { data: AnalyticsData }) {
  const summary = data.tabs.summary;
  return <div className="analytics-stack"><section className="analytics-metrics" aria-label="Metrik ringkasan"><AdminMetricCard label="Total pengguna" value={summary.totalUsers.value} detail="Snapshot saat ini"/><AdminMetricCard label="Membership aktif" value={summary.activeMemberships.value} detail="Snapshot saat ini"/><AdminMetricCard label="Invoice perlu tindakan" value={summary.invoicesAwaitingAction.value} detail="Snapshot saat ini"/><AdminMetricCard label="Invoice terverifikasi/aktif" value={summary.verifiedAndActiveInvoices.value} detail="Snapshot saat ini"/><AdminMetricCard label="Lead placement" value="—" detail="Sesuai periode"/><AdminMetricCard label="Konten terbit" value={summary.publishedContent.value} detail="Snapshot saat ini"/></section><div className="analytics-section-grid"><AdminSection title="Status invoice" description="Distribusi operasional sesuai periode."><DistributionList rows={data.tabs.transactions.invoicesByStatus}/></AdminSection><AdminSection title="Sesi mendatang" description="Jadwal berstatus Terjadwal, snapshot saat ini."><div className="analytics-single-value"><strong>{summary.upcomingSessions.value}</strong><span>sesi mendatang</span></div></AdminSection></div><ExternalAnalytics status={summary.externalAnalytics}/></div>;
}

function Acquisition({ data }: { data: AnalyticsData }) {
  const acquisition = data.tabs.acquisition;
  const snapshot = acquisition.affiliateSnapshot;
  return <div className="analytics-stack"><p className="analytics-scope-note">Data placement mengikuti periode. Data affiliate diberi label snapshot saat ini.</p><div className="analytics-section-grid"><AdminSection title="Rekomendasi placement" description="Distribusi lead placement sesuai periode."><DistributionList rows={acquisition.placementRecommendations}/></AdminSection><AdminSection title="Target placement" description="Distribusi target lead sesuai periode."><DistributionList rows={acquisition.placementTargets}/></AdminSection><AdminSection title="Status lead placement" description="Status operasional lead sesuai periode."><DistributionList rows={acquisition.leadStatuses}/></AdminSection><AdminSection title="Atribusi referral" description="Invoice beratribusi referral sesuai periode."><DistributionList rows={acquisition.referralAttributedInvoices} value/></AdminSection></div><AdminSection title="Affiliate — snapshot saat ini" description="Akumulasi tersimpan saat ini; tidak berubah oleh pilihan periode."><div className="analytics-snapshot-table"><span>Affiliate<strong>{snapshot.affiliates}</strong></span><span>Affiliate aktif<strong>{snapshot.activeAffiliates}</strong></span><span>Klik<strong>—</strong></span><span>Pendaftaran<strong>—</strong></span><span>Pembelian<strong>—</strong></span></div></AdminSection></div>;
}

function Learning({ data }: { data: AnalyticsData }) {
  const learning = data.tabs.learning;
  return <div className="analytics-stack"><p className="analytics-scope-note">Inventaris konten dan sesi saja. Tidak ada klaim performa pembelajar.</p><section className="analytics-metrics" aria-label="Inventaris pembelajaran"><AdminMetricCard label="Program terbit" value={learning.publishedPrograms.value} detail="Snapshot saat ini"/><AdminMetricCard label="Bab terbit" value={learning.publishedChapters.value} detail="Snapshot saat ini"/><AdminMetricCard label="Asesmen terbit" value={learning.publishedAssessments.value} detail="Snapshot saat ini"/><AdminMetricCard label="Deck terbit" value={learning.publishedDecks.value} detail="Snapshot saat ini"/><AdminMetricCard label="Materi terbit" value={learning.publishedMaterials.value} detail="Snapshot saat ini"/><AdminMetricCard label="Replay terbit" value={learning.publishedReplays.value} detail="Snapshot saat ini"/></section><div className="analytics-section-grid"><AdminSection title="Bab per program"><DistributionList rows={learning.chaptersByProgram}/></AdminSection><AdminSection title="Asesmen per jenis"><DistributionList rows={learning.assessmentsByType}/></AdminSection><AdminSection title="Materi per jenis"><DistributionList rows={learning.materialsByType}/></AdminSection><AdminSection title="Replay per program"><DistributionList rows={learning.replaysByProgram}/></AdminSection></div><AdminSection title="Sesi mendatang" description="Snapshot jadwal berstatus Terjadwal."><div className="analytics-single-value"><strong>{learning.upcomingSessions.value}</strong><span>sesi mendatang</span></div></AdminSection></div>;
}

function Transactions({ data }: { data: AnalyticsData }) {
  const transactions = data.tabs.transactions;
  return <div className="analytics-stack"><section className="analytics-metrics analytics-metrics-three" aria-label="Nilai transaksi"><AdminMetricCard label="Invoice terverifikasi/aktif" value={rupiah.format(transactions.verifiedAndActiveValue.value)} detail="Sesuai periode"/><AdminMetricCard label="Komisi tersedia" value={rupiah.format(transactions.availableCommission.value)} detail="Sesuai periode"/><AdminMetricCard label="Komisi dicairkan" value={rupiah.format(transactions.paidCommission.value)} detail="Sesuai periode"/></section><div className="analytics-section-grid"><AdminSection title="Invoice per status" description="Jumlah dan nilai sesuai periode."><DistributionList rows={transactions.invoicesByStatus} value/></AdminSection><AdminSection title="Komisi per status" description="Jumlah dan nilai sesuai periode."><DistributionList rows={transactions.commissionsByStatus} value/></AdminSection><AdminSection title="Pencairan per status" description="Jumlah sesuai periode."><DistributionList rows={transactions.payoutsByStatus}/></AdminSection><AdminSection title="Nilai pencairan per status" description="Jumlah dan nilai sesuai periode."><DistributionList rows={transactions.payoutValueByStatus} value/></AdminSection></div></div>;
}

function ExternalAnalytics({ status }: { status: AnalyticsData["tabs"]["summary"]["externalAnalytics"] }) {
  return <aside className="analytics-external"><div><h2>External Analytics</h2><p>GA4 / Meta mengikuti status integrasi Analitik di Pengaturan Integrasi; bukan data performa eksternal.</p></div><AdminStatusBadge status={status.label}/><Link href="/admin/pengaturan-integrasi?tab=Integrasi">Buka Pengaturan Integrasi</Link></aside>;
}

export function AdminAnalyticsDashboard() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Ringkasan");
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const load = useCallback(() => loadCanonicalAnalytics(period), [period]);
  const request = useLearningRequest(load, `analytics-${period}`);
  const data = request.data;
  if (!data) return <AdminShell current="/admin/analitik"><main className="admin-page admin-analytics"><p role={request.error ? "alert" : "status"}>{request.error ?? "Memuat…"}</p>{request.error && <button type="button" onClick={request.retry}>Coba Lagi</button>}</main></AdminShell>;
  return <AdminShell current="/admin/analitik"><main className="admin-page admin-analytics"><AdminBreadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "Analitik" }]}/><AdminPageHeader eyebrow="PANEL ADMIN • ANALITIK" title="Analitik" description="Ringkasan operasional dari data yang tersedia di panel admin." actions={<fieldset className="analytics-period"><legend>Periode</legend>{periods.map((item) => <button key={item.value} type="button" className={period === item.value ? "active" : ""} aria-pressed={period === item.value} onClick={() => setPeriod(item.value)}>{item.label}</button>)}</fieldset>}/><AdminTabs tabs={tabs} active={tab} onChange={(next) => setTab(next as (typeof tabs)[number])} label="Bagian analitik">{tab === "Ringkasan" && <Summary data={data}/>} {tab === "Akuisisi" && <Acquisition data={data}/>} {tab === "Pembelajaran" && <Learning data={data}/>} {tab === "Transaksi" && <Transactions data={data}/>}</AdminTabs></main></AdminShell>;
}
