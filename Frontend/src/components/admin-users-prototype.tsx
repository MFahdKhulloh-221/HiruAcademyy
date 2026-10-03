"use client";

import { useCallback, useState, type FormEvent } from "react";
import { LuSearch } from "react-icons/lu";
import { AdminConfirmDialog, AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { adminAccessError, adminAccessStatus, adminEffectiveAccess, adminProfileError, adminPrograms, useAdminOperations, type AdminAccess, type AdminOperationalUser, type AdminProgram } from "@/components/admin-operational-state";

export function AdminUsersPrototype() {
  const { users, setUsers, invoices, affiliates } = useAdminOperations();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = users.find((user) => user.id === selectedId);
  const [draft, setDraft] = useState<AdminOperationalUser | null>(null);
  const [accessDraft, setAccessDraft] = useState<{ userId: string; access: AdminAccess } | null>(null);
  const [pending, setPending] = useState<{ userId: string; accessId?: string } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const closeProfile = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeAccess = useCallback(() => { setAccessDraft(null); setError(""); }, []);
  const closeDetail = useCallback(() => setSelectedId(null), []);
  const closeConfirm = useCallback(() => setPending(null), []);
  function edit(user?: AdminOperationalUser) { setError(""); setDraft(user ? { ...user } : { id: "", name: "", email: "", whatsapp: "", country: "", targetJLPT: "", role: "student", status: "Aktif", accesses: [] }); }
  function editAccess(userId: string, access?: AdminAccess) { setError(""); setAccessDraft({ userId, access: access ? { ...access } : { id: "", program: "N5", plan: "lms", start: "", end: "", status: "Aktif" } }); }
  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const invalid = adminProfileError(draft);
    if (invalid) { setError(invalid); return; }
    if (users.some((user) => user.id !== draft.id && user.email.toLowerCase() === draft.email.trim().toLowerCase())) { setError("Email sudah digunakan pengguna lain."); return; }
    if (draft.role === "admin" && (draft.accesses.length || invoices.some((invoice) => invoice.userId === draft.id))) { setError("Pengguna dengan akses atau invoice harus tetap ber-role student."); return; }
    const user = { ...draft, id: draft.id || crypto.randomUUID(), name: draft.name.trim(), email: draft.email.trim(), whatsapp: draft.whatsapp.trim(), country: draft.country?.trim() || "", targetJLPT: draft.targetJLPT?.trim() || "" };
    setUsers((current) => draft.id ? current.map((item) => item.id === user.id ? { ...user, accesses: item.accesses } : item) : [...current, user]);
    setMessage("Profil pengguna diperbarui untuk sesi ini."); closeProfile();
  }
  function saveAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessDraft) return;
    const invalid = adminAccessError(accessDraft.access);
    if (invalid) { setError(invalid); return; }
    const user = users.find((item) => item.id === accessDraft.userId);
    if (!user || user.role !== "student") { setError("Akses program hanya untuk student."); return; }
    if (accessDraft.access.invoiceId) { setError("Akses dari invoice bersifat read-only."); return; }
    const access = { ...accessDraft.access, id: accessDraft.access.id || crypto.randomUUID() };
    setUsers((current) => current.map((item) => item.id !== user.id ? item : { ...item, accesses: accessDraft.access.id ? item.accesses.map((record) => record.id === access.id ? access : record) : [...item.accesses, access] }));
    setMessage("Akses program diperbarui untuk sesi ini."); closeAccess();
  }
  function remove() {
    if (!pending) return;
    if (!pending.accessId && (invoices.some((invoice) => invoice.userId === pending.userId) || affiliates.some((affiliate) => affiliate.userId === pending.userId))) { setMessage("Pengguna terhubung dengan invoice atau affiliate. Nonaktifkan profil; hapus relasi terlebih dahulu untuk menghapus pengguna."); closeConfirm(); return; }
    if (pending.accessId && users.find((user) => user.id === pending.userId)?.accesses.find((access) => access.id === pending.accessId)?.invoiceId) { setMessage("Akses dari invoice bersifat read-only."); closeConfirm(); return; }
    setUsers((current) => pending.accessId ? current.map((user) => user.id !== pending.userId ? user : { ...user, accesses: user.accesses.filter((access) => access.id !== pending.accessId) }) : current.filter((user) => user.id !== pending.userId));
    if (!pending.accessId) setSelectedId(null);
    setMessage("Data dihapus dari sesi ini."); closeConfirm();
  }
  const visible = users.filter((user) => `${user.name} ${user.email} ${user.whatsapp}`.toLowerCase().includes(search.trim().toLowerCase()) && (!role || user.role === role) && (!status || user.status === status));
  return <AdminShell current="/admin/pengguna-akses"><main className="admin-public-prototype">
    <AdminPageHeader title="Pengguna & Akses" description="Data runtime React saja. Perubahan bertahan selama navigasi Admin; refresh mengembalikan data contoh." actions={<button type="button" className="button button-primary" onClick={() => edit()}>Tambah Pengguna</button>} />
    <p role="status">{message}</p>
    <AdminSection title="Daftar Pengguna dan Status Hak Akses">
      <AdminFilterToolbar><label className="admin-prototype-search"><LuSearch aria-hidden="true" /><input aria-label="Cari pengguna" placeholder="Cari nama, email, atau WhatsApp" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="admin-field">Role<select value={role} onChange={(event) => setRole(event.target.value)}><option value="">Semua Role</option><option value="student">student</option><option value="admin">admin</option></select></label><label className="admin-field">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua Status</option><option>Aktif</option><option value="Nonaktif">Tidak Aktif</option></select></label></AdminFilterToolbar>
      <AdminDataTable caption="Pengguna dan hak akses — data prototype" rows={visible} rowKey={(user) => user.id} columns={[
        { key: "name", header: "Nama Siswa", cell: (user) => user.name }, { key: "email", header: "Email", cell: (user) => user.email }, { key: "phone", header: "WhatsApp", cell: (user) => user.whatsapp }, { key: "role", header: "Role", cell: (user) => user.role },
        { key: "plan", header: "Membership", cell: (user) => user.role === "admin" ? "—" : user.accesses.length ? [...new Set(user.accesses.map((access) => access.plan === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei"))].join(", ") : "Free Member" },
        { key: "programs", header: "Level / Program", cell: (user) => user.accesses.map((access) => access.program).join(", ") || "—" }, { key: "status", header: "Account Status", cell: (user) => <AdminStatusBadge status={user.status === "Nonaktif" ? "Tidak Aktif" : user.status} /> },
      ]} actions={{ cell: (user) => <div className="admin-page-actions"><button type="button" className="button" onClick={() => setSelectedId(user.id)} aria-label={`Detail ${user.name}`}>Detail</button><button type="button" className="button" onClick={() => edit(user)} aria-label={`Edit ${user.name}`}>Edit</button><button type="button" className="button" onClick={() => setPending({ userId: user.id })} aria-label={`Hapus ${user.name}`}>Hapus</button></div> }} />
    </AdminSection>
    <AdminDialog open={Boolean(selected)} title="Detail Pengguna" close={closeDetail}>{selected && <>
      <dl className="admin-user-detail">{[["Nama Siswa", selected.name], ["Email", selected.email], ["WhatsApp", selected.whatsapp], ["Negara", selected.country || "—"], ["Target JLPT", selected.targetJLPT || "—"], ["Role", selected.role], ["Account Status", selected.status === "Nonaktif" ? "Tidak Aktif" : selected.status]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {selected.role === "student" && <><AdminSection title="Akses program" actions={<button type="button" className="button" onClick={() => { closeDetail(); editAccess(selected.id); }}>Tambah Akses</button>}>
        <AdminDataTable caption="Riwayat akses program" rows={selected.accesses} rowKey={(access) => access.id} empty="Free Member" columns={[
          { key: "program", header: "Level / Program", cell: (access) => access.program }, { key: "plan", header: "Membership", cell: (access) => access.plan === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei" }, { key: "start", header: "Tanggal mulai", cell: (access) => access.start }, { key: "end", header: "Aktif Sampai", cell: (access) => access.end }, { key: "status", header: "Status", cell: (access) => <AdminStatusBadge status={adminAccessStatus(access)} /> }, { key: "invoice", header: "Invoice", cell: (access) => access.invoiceId || "Manual" },
        ]} actions={{ cell: (access) => access.invoiceId ? "Read-only" : <div className="admin-page-actions"><button type="button" className="button" onClick={() => { closeDetail(); editAccess(selected.id, access); }}>Edit</button><button type="button" className="button" onClick={() => { closeDetail(); setPending({ userId: selected.id, accessId: access.id }); }}>Hapus</button></div> }} />
      </AdminSection><AdminSection title="Akses efektif" description="Read-only. Materi kumulatif DASAR sampai level dimiliki; level lebih tinggi Preview Chapter 1. Free: Preview Chapter 1 DASAR–N1; SSW dan Interview terkunci jika belum dimiliki. Replay Sensei kumulatif N5 sampai level dimiliki. SSW dan Interview berdiri sendiri."><AdminDataTable caption="Akses efektif hari ini — Asia/Jakarta" rows={adminEffectiveAccess(selected)} rowKey={(row) => row.program} columns={[{ key: "program", header: "Level / Program", cell: (row) => row.program }, { key: "material", header: "Materi", cell: (row) => row.material }, { key: "replay", header: "Replay", cell: (row) => ["DASAR", "SSW", "INTERVIEW"].includes(row.program) ? "—" : selected.status !== "Aktif" ? "Tidak Aktif" : row.replay }]} /></AdminSection></>}
    </>}</AdminDialog>
    <AdminDialog open={Boolean(draft)} title={draft?.id ? "Edit Pengguna" : "Tambah Pengguna"} close={closeProfile}>{draft && <form className="admin-prototype-form" onSubmit={saveProfile} noValidate>
      <label className="admin-field">Nama Siswa<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label><label className="admin-field">Email<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required /></label><label className="admin-field">WhatsApp<input type="tel" value={draft.whatsapp} onChange={(event) => setDraft({ ...draft, whatsapp: event.target.value })} required /></label><label className="admin-field">Negara<input value={draft.country || ""} onChange={(event) => setDraft({ ...draft, country: event.target.value })} /></label><label className="admin-field">Target JLPT<input value={draft.targetJLPT || ""} onChange={(event) => setDraft({ ...draft, targetJLPT: event.target.value })} /></label><label className="admin-field">Role<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AdminOperationalUser["role"] })}><option value="student">student</option><option value="admin">admin</option></select></label><label className="admin-field">Account Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminOperationalUser["status"] })}><option>Aktif</option><option value="Nonaktif">Tidak Aktif</option></select></label>
      {error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button type="button" className="button" onClick={closeProfile}>Batal</button><button type="submit" className="button button-primary">Simpan</button></div>
    </form>}</AdminDialog>
    <AdminDialog open={Boolean(accessDraft)} title={accessDraft?.access.id ? "Edit Akses" : "Tambah Akses"} close={closeAccess}>{accessDraft && <form className="admin-prototype-form" onSubmit={saveAccess} noValidate>
      <p>{users.find((user) => user.id === accessDraft.userId)?.name}</p><label className="admin-field">Level / Program<select value={accessDraft.access.program} onChange={(event) => { const program = event.target.value as AdminProgram; setAccessDraft({ ...accessDraft, access: { ...accessDraft.access, program, plan: ["SSW", "INTERVIEW"].includes(program) ? "lms" : accessDraft.access.plan } }); }}>{adminPrograms.map((program) => <option key={program}>{program}</option>)}</select></label>
      <label className="admin-field">Membership<select value={accessDraft.access.plan} onChange={(event) => setAccessDraft({ ...accessDraft, access: { ...accessDraft.access, plan: event.target.value as AdminAccess["plan"] } })}><option value="lms">Belajar Mandiri</option>{!["SSW", "INTERVIEW"].includes(accessDraft.access.program) && <option value="sensei">Kelas bersama Sensei</option>}</select></label>
      <label className="admin-field">Tanggal mulai<input type="date" value={accessDraft.access.start} onChange={(event) => setAccessDraft({ ...accessDraft, access: { ...accessDraft.access, start: event.target.value } })} required /></label><label className="admin-field">Tanggal akhir<input type="date" min={accessDraft.access.start || undefined} value={accessDraft.access.end} onChange={(event) => setAccessDraft({ ...accessDraft, access: { ...accessDraft.access, end: event.target.value } })} required /></label><label className="admin-field">Status<select value={accessDraft.access.status} onChange={(event) => setAccessDraft({ ...accessDraft, access: { ...accessDraft.access, status: event.target.value as AdminAccess["status"] } })}><option>Aktif</option><option value="Nonaktif">Tidak Aktif</option></select></label>
      {error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button type="button" className="button" onClick={closeAccess}>Batal</button><button type="submit" className="button button-primary">Simpan</button></div>
    </form>}</AdminDialog>
    <AdminConfirmDialog open={Boolean(pending)} title={pending?.accessId ? "Hapus Akses?" : "Hapus Pengguna?"} close={closeConfirm} actions={<><button type="button" className="button" onClick={closeConfirm}>Batal</button><button type="button" className="button button-primary" onClick={remove}>Konfirmasi</button></>}><p>{users.find((user) => user.id === pending?.userId)?.name}: {pending?.accessId ? "akses program" : "profil pengguna"} akan dihapus dari sesi ini.</p></AdminConfirmDialog>
  </main></AdminShell>;
}
