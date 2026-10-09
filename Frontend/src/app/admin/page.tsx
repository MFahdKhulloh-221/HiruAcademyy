"use client";

import Link from "next/link";
import { useState } from "react";
import { useLearningRequest } from "@/components/learning-hooks";
import { LuCalendar, LuClipboardCheck, LuExternalLink, LuFolder, LuNewspaper, LuReceipt, LuUsers } from "react-icons/lu";
import { commercialData } from "@/lib/commercial-api";
import { AdminShell } from "@/components/admin-shell";
import { AdminBreadcrumb, AdminDataTable, AdminDialog, AdminPageHeader, AdminSection, AdminStatusBadge } from "@/components/admin-primitives";

const quickActions = [
  { label: "Tinjau Invoice", href: "/admin/invoice", detail: "Tinjau invoice dan status pembayaran.", icon: LuReceipt, tone: "orange", highlight: false },
  { label: "Kelola Pengguna", href: "/admin/pengguna-akses", detail: "Tinjau pengguna dan hak akses.", icon: LuUsers, tone: "navy", highlight: true },
  { label: "Kelola Artikel", href: "/admin/blog-seo", detail: "Buka area artikel publik.", icon: LuNewspaper, tone: "orange", highlight: false },
  { label: "Kelola Materi", href: "/admin/video-lesson", detail: "Buka area materi pembelajaran.", icon: LuFolder, tone: "navy", highlight: false },
  { label: "Kelola Jadwal", href: "/admin/kelas-jadwal", detail: "Buka jadwal dan replay.", icon: LuCalendar, tone: "orange", highlight: false },
  { label: "Kelola Placement Test", href: "/admin/placement-hasil", detail: "Buka area Placement Test.", icon: LuClipboardCheck, tone: "navy", highlight: false },
];

type DashboardUser = { id: number; name: string; email: string; whatsapp: string; account_status: string; membership: string; program: string; activeUntil: string; status: string };

async function loadDashboardUsers(signal: AbortSignal) {
  const rows = await commercialData<(DashboardUser & { effective_access: { source_grants: { plan_code: string; program_code: string; ends_at: string }[] } })[]>("/api/admin/users?include=effective_access", signal);
  return rows.map(row => {
    const grants = row.effective_access.source_grants;
    return { ...row, membership: grants.some(grant => grant.plan_code === "sensei") ? "Kelas bersama Sensei" : grants.length ? "Belajar Mandiri" : "Free Member", program: grants.map(grant => grant.program_code.toUpperCase()).join(", ") || "—", activeUntil: grants.map(grant => grant.ends_at).sort().at(-1)?.slice(0, 10) ?? "—", status: row.account_status === "active" ? "Aktif" : "Nonaktif" };
  });
}

export default function AdminDashboardPage() {
  const request = useLearningRequest(loadDashboardUsers, "admin-dashboard-users");
  const users = request.data ?? [];
  const error = request.error;
  const [selectedUser, setSelected] = useState<DashboardUser | null>(null);
  const selected = users.find(row => row.id === selectedUser?.id) ?? null;
  return <AdminShell current="/admin"><main className="admin-page admin-dashboard">
    <AdminBreadcrumb items={[{ label: "Admin" }, { label: "Dashboard" }]} />
    <AdminPageHeader title="Dashboard Admin" description="Pilih area pengelolaan dan tinjau status hak akses siswa." actions={<a className="admin-dashboard-preview" href="/" target="_blank" rel="noopener noreferrer">Pratinjau frontend<LuExternalLink size={18} aria-hidden="true" /></a>} />
    <AdminSection title="Menu Cepat" className="admin-dashboard-menu"><div className="admin-quick-actions">{quickActions.map((item) => <Link href={item.href} key={item.href} className={item.highlight ? "admin-quick-action-highlight" : undefined}><span className={`admin-quick-action-icon tone-${item.tone}`}><item.icon size={24} aria-hidden="true" /></span><strong>{item.label}</strong><span className="admin-quick-action-description">{item.detail}</span></Link>)}</div></AdminSection>
    {error && <p role="alert">{error}</p>}
    <AdminSection title="Daftar Pengguna dan Status Hak Akses">
      <AdminDataTable loading={request.loading && !request.data} caption="Pengguna dan hak akses" rows={users} rowKey={(row) => String(row.id)} columns={[
        { key: "name", header: "Nama Siswa", cell: (row) => <strong>{row.name}</strong> },
        { key: "email", header: "Email", cell: (row) => row.email },
        { key: "whatsapp", header: "WhatsApp", cell: (row) => row.whatsapp },
        { key: "membership", header: "Membership", cell: (row) => row.membership },
        { key: "program", header: "Level / Program", cell: (row) => row.program },
        { key: "activeUntil", header: "Aktif Sampai", cell: (row) => row.activeUntil },
        { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.status} /> },
      ]} actions={{ header: "Aksi", cell: (row) => <button className="admin-detail-button" type="button" onClick={() => setSelected(row)} aria-label={`Detail ${row.name}`}>Detail</button> }} />
    </AdminSection>
    <AdminDialog open={!!selected} title="Detail Pengguna" close={() => setSelected(null)}>{selected && <dl className="admin-user-detail">{[
      ["Nama Siswa", selected.name], ["Email", selected.email], ["WhatsApp", selected.whatsapp], ["Role", "student"], ["Membership", selected.membership], ["Level / Program", selected.program], ["Aktif Sampai", selected.activeUntil], ["Status", selected.status],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</AdminDialog>
  </main></AdminShell>;
}
