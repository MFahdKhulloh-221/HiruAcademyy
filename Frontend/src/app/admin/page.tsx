"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { commercialData } from "@/lib/commercial-api";
import { AdminShell } from "@/components/admin-shell";
import { AdminBreadcrumb, AdminDataTable, AdminDialog, AdminPageHeader, AdminSection, AdminStatusBadge } from "@/components/admin-primitives";

const quickActions = [
  { label: "Tinjau Invoice", href: "/admin/invoice", detail: "Tinjau invoice dan status pembayaran." },
  { label: "Kelola Pengguna", href: "/admin/pengguna-akses", detail: "Tinjau pengguna dan hak akses." },
  { label: "Kelola Artikel", href: "/admin/blog-seo", detail: "Buka area artikel publik." },
  { label: "Kelola Materi", href: "/admin/video-lesson", detail: "Buka area materi pembelajaran." },
  { label: "Kelola Jadwal", href: "/admin/kelas-jadwal", detail: "Buka jadwal dan replay." },
  { label: "Kelola Placement Test", href: "/admin/placement-hasil", detail: "Buka area Placement Test." },
];

type DashboardUser = { id: number; name: string; email: string; whatsapp: string; account_status: string; membership: string; program: string; activeUntil: string; status: string };

export default function AdminDashboardPage() {
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DashboardUser | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void commercialData<DashboardUser[]>("/api/admin/users").then(async rows => {
      const data = await Promise.all(rows.map(async row => {
        const access = await commercialData<{ source_grants: { plan_code: string; program_code: string; ends_at: string }[] }>(`/api/admin/users/${row.id}/effective-access`);
        const grants = access.source_grants;
        return { ...row, membership: grants.some(grant => grant.plan_code === "sensei") ? "Kelas bersama Sensei" : grants.length ? "Belajar Mandiri" : "Free Member", program: grants.map(grant => grant.program_code.toUpperCase()).join(", ") || "—", activeUntil: grants.map(grant => grant.ends_at).sort().at(-1)?.slice(0, 10) ?? "—", status: row.account_status === "active" ? "Aktif" : "Nonaktif" };
      }));
      if (!controller.signal.aborted) setUsers(data);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil."); });
    return () => controller.abort();
  }, []);
  return <AdminShell current="/admin"><main className="admin-page admin-dashboard">
    <AdminBreadcrumb items={[{ label: "Admin" }, { label: "Dashboard" }]} />
    <AdminPageHeader title="Dashboard Admin" description="Pilih area pengelolaan dan tinjau status hak akses siswa." />
    <AdminSection title="Menu Cepat"><div className="admin-quick-actions">{quickActions.map((item) => <Link href={item.href} key={item.href}><strong>{item.label}</strong><span>{item.detail}</span></Link>)}</div></AdminSection>
    {error && <p role="alert">{error}</p>}
    <AdminSection title="Daftar Pengguna dan Status Hak Akses">
      <AdminDataTable caption="Pengguna dan hak akses" rows={users} rowKey={(row) => String(row.id)} columns={[
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
