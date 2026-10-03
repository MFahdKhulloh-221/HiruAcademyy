"use client";

import Link from "next/link";
import { useState } from "react";
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

const users = [
  { id: "USR-001", name: "Hilmi Farhan", email: "hilmi@example.com", whatsapp: "081234567801", membership: "Belajar Mandiri", program: "N4", activeUntil: "1 Jan 2027", status: "Aktif" },
  { id: "USR-002", name: "Ayu Pratama", email: "ayu@example.com", whatsapp: "081234567802", membership: "Free Member", program: "-", activeUntil: "-", status: "Aktif" },
  { id: "USR-004", name: "Rina Wulandari", email: "rina@example.com", whatsapp: "081234567804", membership: "Kelas bersama Sensei", program: "N4", activeUntil: "1 Jan 2027", status: "Aktif" },
];

export default function AdminDashboardPage() {
  const [selected, setSelected] = useState<(typeof users)[number] | null>(null);
  return <AdminShell current="/admin"><main className="admin-page admin-dashboard">
    <AdminBreadcrumb items={[{ label: "Admin" }, { label: "Dashboard" }]} />
    <AdminPageHeader title="Dashboard Admin" description="Pilih area pengelolaan dan tinjau status hak akses siswa." />
    <AdminSection title="Menu Cepat"><div className="admin-quick-actions">{quickActions.map((item) => <Link href={item.href} key={item.href}><strong>{item.label}</strong><span>{item.detail}</span></Link>)}</div></AdminSection>
    <AdminSection title="Daftar Pengguna dan Status Hak Akses" description="Data contoh untuk pratinjau UI. Tidak disimpan dan bukan data produksi.">
      <AdminDataTable caption="Pengguna dan hak akses — data prototype" rows={users} rowKey={(row) => row.id} columns={[
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
