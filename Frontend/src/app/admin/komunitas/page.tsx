"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { apiRequest } from "@/lib/api";
import { fetchCommunityTopics, type CommunityTopic } from "@/lib/community-api";

type Message = { deleted_at?: string | null; id: number; content: string; status: string; created_at: string; user: { name: string }; room: { topic: { title: string } } };
type Report = { id: number; reason: string; status: string; created_at: string; reporter: { name: string }; message: Message };
type Page = { data: (Message | Report)[]; current_page: number; last_page: number };
export default function CommunityModeration() {
  const [topics, setTopics] = useState<CommunityTopic[]>([]);
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [view, setView] = useState("messages");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page>();
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  function clearResults() { setData(undefined); setError(""); }
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ view, page: String(page) });
    if (topic) query.set("topic_id", topic);
    if (status) query.set("status", status);
    if (reportStatus) query.set("report_status", reportStatus);
    Promise.all([fetchCommunityTopics(controller.signal), apiRequest<Page>(`/api/admin/community/moderation?${query}`, { signal: controller.signal })])
      .then(([topics, rows]) => { setTopics(topics); setData(rows); })
      .catch(() => { if (!controller.signal.aborted) setError("Daftar moderasi gagal dimuat."); });
    return () => controller.abort();
  }, [view, topic, status, reportStatus, page, revision]);
  async function act(path: string, status: string, confirmation: string, method = "PATCH") {
    if (!window.confirm(confirmation)) return;
    setBusy(true); setFeedback(""); setError("");
    try { await apiRequest(path, { method, body: method === "DELETE" ? undefined : JSON.stringify({ status }) }); setFeedback("Tindakan tersimpan."); clearResults(); setRevision(value => value + 1); }
    catch { setError("Tindakan gagal disimpan. Coba lagi."); }
    finally { setBusy(false); }
  }
  return <AdminShell current="/admin/komunitas"><main className="admin-page community-moderation">
    <h1>Moderasi Komunitas</h1>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <label>Daftar<select aria-label="Daftar" value={view} onChange={event => { clearResults(); setView(event.target.value); setPage(1); }}><option value="messages">Pesan</option><option value="reports">Laporan</option></select></label>
      <label>Kategori<select aria-label="Kategori" value={topic} onChange={event => { clearResults(); setTopic(event.target.value); setPage(1); }}><option value="">Semua kategori</option>{topics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label>
      <label>Status pesan<select aria-label="Status pesan" value={status} onChange={event => { clearResults(); setStatus(event.target.value); setPage(1); }}><option value="">Semua</option><option value="published">Published</option><option value="hidden">Hidden</option></select></label>
      {view === "reports" && <label>Status laporan<select aria-label="Status laporan" value={reportStatus} onChange={event => { clearResults(); setReportStatus(event.target.value); setPage(1); }}><option value="">Semua</option><option value="pending">Pending</option><option value="handled">Handled</option></select></label>}
    </div>
    {error && <p role="alert">{error} <button onClick={() => { clearResults(); setRevision(value => value + 1); }}>Coba lagi</button></p>}
    {feedback && <p role="status">{feedback}</p>}
    {!data && !error && <p role="status">Memuat moderasi…</p>}
    {data?.data.map(row => {
      const report = "message" in row ? row : undefined;
      const message = report ? report.message : row as Message;
      return <article key={row.id} style={{ padding: 16, marginBlock: 16, border: "1px solid #ccc", overflowWrap: "anywhere" }}>
        <h2>{message.user.name} · {message.room.topic.title}</h2>
        <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</time>
        <p>{message.content}</p><p>Status pesan: {message.status}</p>
        {report && <><p>Pelapor: {report.reporter.name} · {new Date(report.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p><p>Alasan: {report.reason}</p><p>Status laporan: {report.status}</p></>}
        <button style={{ minHeight: 44 }} disabled={busy || !!message.deleted_at} onClick={() => void act(`/api/community/messages/${message.id}`, message.status === "hidden" ? "published" : "hidden", message.status === "hidden" ? "Tampilkan kembali pesan ini kepada siswa?" : "Sembunyikan pesan ini dari siswa?")}>{message.status === "hidden" ? "Pulihkan pesan" : "Sembunyikan pesan"}</button>
        {message.deleted_at ? <p>Pesan dihapus · Riwayat audit dipertahankan</p> : <button style={{ minHeight: 44 }} disabled={busy} onClick={() => void act(`/api/community/messages/${message.id}`, "", "Hapus pesan dari percakapan? Data dan laporan tetap disimpan untuk audit. Tindakan ini tidak menyediakan pemulihan melalui UI.", "DELETE")}>Hapus pesan</button>}
        {report?.status === "pending" && <button style={{ minHeight: 44 }} disabled={busy} onClick={() => void act(`/api/admin/community/reports/${report.id}`, "handled", "Tandai laporan telah ditinjau? Status pesan tidak berubah.")}>Tandai ditangani</button>}
      </article>;
    })}
    {data?.data.length === 0 && <p>Tidak ada hasil.</p>}
    {data && <nav aria-label="Halaman moderasi"><button style={{ minHeight: 44 }} disabled={page <= 1 || busy} onClick={() => { clearResults(); setPage(value => value - 1); }}>Sebelumnya</button><span> {data.current_page} / {data.last_page} </span><button style={{ minHeight: 44 }} disabled={page >= data.last_page || busy} onClick={() => { clearResults(); setPage(value => value + 1); }}>Berikutnya</button></nav>}
  </main></AdminShell>;
}
