"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { LuArrowLeft } from "react-icons/lu";
import { useLearningRequest } from "@/components/learning-hooks";
import {
  createCommunityReply,
  createCommunityThread,
  fetchCommunityThread,
  fetchCommunityThreads,
  fetchCommunityTopics,
  type CommunityThread,
} from "@/lib/community-api";

export function AskSenseiScreen() {
  const [tab, setTab] = useState<"Tanya Sensei" | "Riwayat">("Tanya Sensei");
  const [selectedThreadId, setSelectedThreadId] = useState<number>();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  const loadTopics = useCallback((signal: AbortSignal) => fetchCommunityTopics(signal), []);
  const topicsReq = useLearningRequest(loadTopics, "community-topics");

  const loadThreads = useCallback(
    (signal: AbortSignal) => fetchCommunityThreads({ is_ask_sensei: true }, signal),
    []
  );
  const threadsReq = useLearningRequest(loadThreads, "ask-sensei-threads");

  const loadSingleThread = useCallback(
    (signal: AbortSignal) =>
      selectedThreadId ? fetchCommunityThread(selectedThreadId, signal) : Promise.resolve(null),
    [selectedThreadId]
  );
  const singleReq = useLearningRequest(loadSingleThread, `ask-sensei-thread-${selectedThreadId ?? ""}`);

  const tanyaTopic = topicsReq.data?.find(t => t.slug === "tanya-sensei");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!tanyaTopic || busy) return;
    setBusy(true);
    setError("");
    try {
      await createCommunityThread({
        topic_id: tanyaTopic.id,
        title,
        content,
        is_ask_sensei: true,
      });
      setSubmitted(true);
      setTitle("");
      setContent("");
      threadsReq.retry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mengirim pertanyaan.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendReply(thread: CommunityThread) {
    if (!replyText.trim() || replyBusy) return;
    setReplyBusy(true);
    try {
      await createCommunityReply(thread.id, replyText.trim());
      setReplyText("");
      singleReq.retry();
      threadsReq.retry();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Gagal mengirim jawaban.");
    } finally {
      setReplyBusy(false);
    }
  }

  if (selectedThreadId && singleReq.data) {
    const thread = singleReq.data;

    return (
      <div className="ask-detail-view" style={{ maxWidth: "800px", margin: "0 auto", padding: "20px 0" }}>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setSelectedThreadId(undefined)}
          style={{ marginBottom: "20px", display: "inline-flex", alignItems: "center", gap: "8px" }}
        >
          <LuArrowLeft aria-hidden="true" /> Kembali ke Riwayat
        </button>

        <article className="ask-thread-main" style={{ padding: "24px", background: "#fff", borderRadius: "16px", border: "1px solid var(--line)" }}>
          <header style={{ marginBottom: "16px" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>
              {thread.author.name} • {new Date(thread.created_at).toLocaleDateString("id-ID")}
            </span>
            <h1 style={{ fontSize: "24px", margin: "8px 0" }}>{thread.title}</h1>
          </header>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{thread.content}</p>
        </article>

        <section style={{ marginTop: "24px", display: "grid", gap: "16px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800 }}>Tanggapan ({thread.replies?.length ?? 0})</h2>
          {(thread.replies ?? []).map(r => (
            <article
              key={r.id}
              style={{
                padding: "16px 20px",
                borderRadius: "14px",
                border: "1px solid var(--line)",
                background: r.author.is_sensei ? "#fff7ef" : "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <strong>
                  {r.author.name} {r.author.is_sensei && <span style={{ color: "var(--orange)", fontSize: "11px", marginLeft: "6px" }}>(Sensei Pengajar)</span>}
                </strong>
                <small style={{ color: "var(--muted)" }}>{new Date(r.created_at).toLocaleDateString("id-ID")}</small>
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.content}</p>
            </article>
          ))}

          <form
            onSubmit={e => {
              e.preventDefault();
              void handleSendReply(thread);
            }}
            style={{ marginTop: "16px" }}
          >
            <label style={{ display: "grid", gap: "8px" }}>
              <span style={{ fontWeight: 700 }}>Tulis Jawaban / Balasan:</span>
              <textarea
                required
                rows={4}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Tulis balasan atau penjelasan untuk pertanyaan ini…"
                style={{ padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", font: "inherit" }}
              />
            </label>
            <button
              type="submit"
              disabled={replyBusy || !replyText.trim()}
              className="button button-primary"
              style={{ marginTop: "10px" }}
            >
              {replyBusy ? "Mengirim…" : "Kirim Balasan"}
            </button>
          </form>
        </section>
      </div>
    );
  }

  if (submitted) {
    return (
      <section className="sensei-status-panel">
        <p className="dash-kicker">PERTANYAAN TERKIRIM</p>
        <h1>Pertanyaan untuk Sensei berhasil dikirim</h1>
        <span className="status-mark success">✓</span>
        <div className="status-announcement">
          <strong>Pengumuman</strong>
          <p>Pertanyaan tersimpan di database dan menunggu respons dari Sensei.</p>
        </div>
        <div className="status-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              setSubmitted(false);
              setTab("Riwayat");
            }}
          >
            Lihat Riwayat Pertanyaan
          </button>
          <button className="button button-secondary" type="button" onClick={() => setSubmitted(false)}>
            Tanya Lagi
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="sensei-title-row">
        <header className="sensei-page-head">
          <p className="dash-kicker">TANYA SENSEI</p>
          <h1>Kirim pertanyaan yang terhubung ke materi atau bimbingan belajarmu.</h1>
          <p>Pertanyaan dijawab langsung oleh Sensei pengajar resmi HIRU Academy.</p>
        </header>
        <Link className="button button-primary ask-community-btn" href="/community">
          Buka Forum Komunitas
        </Link>
      </div>

      <div className="ask-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "Tanya Sensei"}
          className={tab === "Tanya Sensei" ? "active" : ""}
          onClick={() => setTab("Tanya Sensei")}
        >
          Tanya Sensei
        </button>
        <button
          role="tab"
          aria-selected={tab === "Riwayat"}
          className={tab === "Riwayat" ? "active" : ""}
          onClick={() => setTab("Riwayat")}
        >
          Riwayat Pertanyaan ({threadsReq.data?.length ?? 0})
        </button>
      </div>

      {tab === "Tanya Sensei" ? (
        <section className="ask-layout">
          <form onSubmit={handleSubmit}>
            <h2>Tulis pertanyaan untuk Sensei</h2>
            <p>Sensei pengajar akan meninjau dan menjawab pertanyaanmu.</p>

            {error && <p role="alert" style={{ color: "#c65b4b" }}>{error}</p>}

            <label>
              Judul Pertanyaan
              <input
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Contoh: Perbedaan penggunaan に dan で untuk tempat"
              />
            </label>

            <label>
              <span>Isi Pertanyaan</span>
              <textarea
                required
                rows={5}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Tuliskan secara jelas bagian materi atau kalimat yang membuatmu bingung…"
              />
            </label>

            <div className="ask-submit-area">
              <button
                className="button button-primary"
                type="submit"
                disabled={busy || !title.trim() || !content.trim()}
              >
                {busy ? "Mengirim…" : "Kirim Pertanyaan ke Sensei"}
              </button>
            </div>
          </form>

          <aside>
            <h2>Sensei Pengajar</h2>
            <p>Sensei pengajar akan merespons pertanyaanmu sesuai antrean.</p>
            <div>
              <span>Waktu respons</span>
              <strong>Dijawab dalam 1x24 jam kerja sesuai urutan antrean.</strong>
            </div>
            <div className="ask-history-mini">
              <span>Pertanyaan terakhir</span>
              <ul>
                {(threadsReq.data ?? []).slice(0, 3).map(t => (
                  <li key={t.id} onClick={() => setSelectedThreadId(t.id)} style={{ cursor: "pointer" }}>
                    <b>{t.title}</b>
                    <i>{t.replies_count > 0 ? "Terjawab" : "Menunggu"}</i>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </section>
      ) : (
        <section className="ask-history-section" style={{ marginTop: "24px" }}>
          {threadsReq.loading && <p role="status">Memuat riwayat…</p>}
          {threadsReq.error && <p role="alert">{threadsReq.error}</p>}
          <div style={{ display: "grid", gap: "12px" }}>
            {(threadsReq.data ?? []).map(t => (
              <article
                key={t.id}
                onClick={() => setSelectedThreadId(t.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "18px 24px",
                  borderRadius: "14px",
                  border: "1px solid var(--line)",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <div>
                  <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 800 }}>{t.title}</h3>
                  <small style={{ color: "var(--muted)" }}>
                    {t.author.name} • {new Date(t.created_at).toLocaleDateString("id-ID")}
                  </small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 700,
                      background: t.replies_count > 0 ? "#eaf3e7" : "#fff1e6",
                      color: t.replies_count > 0 ? "#32643a" : "var(--orange-dark)",
                    }}
                  >
                    {t.replies_count > 0 ? `${t.replies_count} Jawaban` : "Menunggu Jawaban"}
                  </span>
                  <span className="button button-secondary" style={{ padding: "6px 14px", fontSize: "12px" }}>
                    Buka
                  </span>
                </div>
              </article>
            ))}
            {!threadsReq.loading && (threadsReq.data ?? []).length === 0 && (
              <div className="library-empty">
                <h2>Belum ada pertanyaan</h2>
                <p>Kirim pertanyaan pertamamu ke Sensei pada tab Tanya Sensei.</p>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
