"use client";

import styles from "./admin-users-prototype.module.css";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell } from "@/components/admin-primitives";
import { commercialCode, commercialData, commercialId, type EffectiveAccess } from "@/lib/commercial-api";
import { studentWhatsAppUrl } from "@/lib/admin-whatsapp";

type Student = { id: number; name: string; email: string; whatsapp: string; account_status: string; created_at?: string | null };
const dateLabel = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? `${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value))} WIB` : "—";
const planLabel = (plan: string) => plan === "sensei" ? "Belajar dengan Sensei" : "Belajar Mandiri";

export function AdminUsersPrototype() {
  const [users, setUsers] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loadedId, setLoadedId] = useState("");
  const [effective, setEffective] = useState<EffectiveAccess | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const accessRequest = useRef(0);
  const closeDetail = useCallback(() => {
    accessRequest.current++;
    setLoadedId("");
    setEffective(null);
    setAccessLoading(false);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void commercialData<Student[]>("/api/admin/users", controller.signal)
      .then(data => { if (!controller.signal.aborted) setUsers(data); })
      .catch(() => { if (!controller.signal.aborted) setMessage("Daftar pengguna belum berhasil dimuat. Silakan muat ulang halaman."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function load(id: string) {
    const safe = commercialId(id);
    const revision = ++accessRequest.current;
    setLoadedId(safe);
    setEffective(null);
    setAccessLoading(true);
    setMessage("");
    try {
      const projection = await commercialData<EffectiveAccess>(`/api/admin/users/${safe}/effective-access`);
      if (revision === accessRequest.current) setEffective(projection);
    } catch {
      if (revision === accessRequest.current) setMessage("Informasi membership belum berhasil dimuat. Silakan coba lagi.");
    } finally { if (revision === accessRequest.current) setAccessLoading(false); }
  }
  const selectedUser = users.find(user => String(user.id) === loadedId);
  const filteredUsers = users.filter(user => `${user.id} ${user.name} ${user.email} ${user.whatsapp}`.toLowerCase().includes(search.trim().toLowerCase()));
  const grants = effective?.source_grants ?? [];
  const memberships = [...new Set(grants.map(grant => planLabel(grant.plan_code)))];
  const programCodes = [...new Set(grants.map(grant => grant.program_code))];
  return <AdminShell current="/admin/pengguna-akses"><main className="admin-public-prototype">
    <AdminPageHeader title="Pengguna & Akses" description="Lihat informasi akun dan membership siswa." />
    {!loadedId && message && <p role="alert">{message}</p>}
    <AdminSection title="Pengguna" className={styles.list} actions={<span className={styles.userCount}><strong>{filteredUsers.length}</strong> pengguna</span>}>
      <AdminFilterToolbar><label className="admin-field">Cari pengguna<input type="search" placeholder="Nama, email, WhatsApp, atau ID" value={search} onChange={event => setSearch(event.target.value)} /></label></AdminFilterToolbar>
      <AdminDataTable loading={loading} caption="Pengguna" rows={filteredUsers} rowKey={row => String(row.id)} columns={[
        { key: "name", header: "Nama Siswa", cell: row => row.name },
        { key: "email", header: "Email", cell: row => row.email },
        { key: "phone", header: "WhatsApp", cell: row => studentWhatsAppUrl(row.whatsapp) ? <div>{row.whatsapp}<br /><a className="button" href={studentWhatsAppUrl(row.whatsapp)!} target="_blank" rel="noopener noreferrer">Hubungi via WhatsApp</a></div> : "Belum tersedia" },
        { key: "status", header: "Status", cell: row => row.account_status === "active" ? "Aktif" : "Nonaktif" },
      ]} actions={{ cell: row => <button type="button" className="button" onClick={() => void load(String(row.id))}>Detail</button> }} />
    </AdminSection>
    <AdminDialog open={Boolean(selectedUser)} title="Detail Pengguna" close={closeDetail} className={styles.simpleDetail}>{selectedUser && <>
      <dl className={styles.facts}>
        <dt>Nama Siswa</dt><dd>{selectedUser.name}</dd>
        <dt>Email</dt><dd>{selectedUser.email}</dd>
        <dt>WhatsApp</dt><dd>{selectedUser.whatsapp || "—"}</dd>
        <dt>Role</dt><dd>student</dd>
        <dt>Akun dibuat</dt><dd>{dateLabel(selectedUser.created_at)}</dd>
        <dt>Membership</dt><dd>{accessLoading ? "Memuat…" : effective ? memberships.join(", ") || "Free Member" : "Belum tersedia"}</dd>
        <dt>Level / Program</dt><dd>{accessLoading ? "Memuat…" : effective ? programCodes.map(commercialCode).join(", ") || "—" : "Belum tersedia"}</dd>
        <dt>Aktif Sampai</dt><dd>{accessLoading ? "Memuat…" : !effective ? "Belum tersedia" : grants.length ? grants.map(grant => <div key={grant.id}>{grants.length > 1 && `${commercialCode(grant.program_code)} · ${planLabel(grant.plan_code)}: `}{dateLabel(grant.ends_at)}</div>) : "—"}</dd>
        <dt>Status</dt><dd>{selectedUser.account_status === "active" ? "Aktif" : "Nonaktif"}</dd>
      </dl>
      {accessLoading && <LoadingSkeleton variant="list" />}
      {message && <div role="alert"><p>{message}</p><button type="button" className="button" onClick={() => void load(loadedId)}>Coba lagi</button></div>}
    </>}</AdminDialog>
  </main></AdminShell>;
}
