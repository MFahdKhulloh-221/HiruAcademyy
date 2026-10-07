"use client";

import { useCallback, useState } from "react";
import { LuArrowLeft, LuMessagesSquare, LuSearch } from "react-icons/lu";
import { useAuth } from "@/components/auth-provider";
import { useLearningRequest } from "@/components/learning-hooks";
import {
  createCommunityReply,
  createCommunityThread,
  fetchCommunityThread,
  fetchCommunityThreads,
  fetchCommunityTopics,
  type CommunityThread,
} from "@/lib/community-api";
import type { Membership } from "@/lib/dashboard-mock";

export function StudentCommunityScreen({ membership }: { membership: Membership }) {
  const { user } = useAuth();
  const [selectedThreadId, setSelectedThreadId] = useState<number>();
  const [selectedTopicSlug, setSelectedTopicSlug] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "create">("list");

  // Create form state
  const [newTopicId, setNewTopicId] = useState<number>();
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  // Reply form state
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  const canPost = membership !== "free" || user?.role === "admin";

  const loadTopics = useCallback((signal: AbortSignal) => fetchCommunityTopics(signal), []);
  const topicsReq = useLearningRequest(loadTopics, "community-topics");

  const loadThreads = useCallback(
    (signal: AbortSignal) =>
      fetchCommunityThreads(
        {
          topic_slug: selectedTopicSlug === "all" ? undefined : selectedTopicSlug,
          search: search.trim() || undefined,
        },
        signal
      ),
    [selectedTopicSlug, search]
  );
  const threadsReq = useLearningRequest(loadThreads, `community-threads-${selectedTopicSlug}-${search}`);

  const loadSingleThread = useCallback(
    (signal: AbortSignal) =>
      selectedThreadId ? fetchCommunityThread(selectedThreadId, signal) : Promise.resolve(null),
    [selectedThreadId]
  );
  const singleReq = useLearningRequest(loadSingleThread, `community-thread-${selectedThreadId ?? ""}`);

  async function handleCreateThread(e: React.FormEvent) {
    e.preventDefault();
    const topicId = newTopicId ?? topicsReq.data?.[0]?.id;
    if (!topicId || createBusy) return;
    setCreateBusy(true);
    setCreateError("");
    try {
      await createCommunityThread({
        topic_id: topicId,
        title: newTitle,
        content: newContent,
      });
      setNewTitle("");
      setNewContent("");
      setViewMode("list");
      threadsReq.retry();
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "Gagal membuat postingan.");
    } finally {
      setCreateBusy(false);
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
      alert(cause instanceof Error ? cause.message : "Gagal mengirim balasan.");
    } finally {
      setReplyBusy(false);
    }
  }

  // 1. Thread Detail View
  if (selectedThreadId && singleReq.data) {
    const thread = singleReq.data;

    return (
      <div className="community-detail-view" style={{ maxWidth: "840px", margin: "0 auto", padding: "16px 0" }}>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setSelectedThreadId(undefined)}
          style={{ marginBottom: "20px", display: "inline-flex", alignItems: "center", gap: "8px" }}
        >
          <LuArrowLeft aria-hidden="true" /> Kembali ke Diskusi
        </button>

        <article style={{ padding: "24px", background: "#fff", borderRadius: "18px", border: "1px solid var(--line)" }}>
          <header style={{ marginBottom: "16px" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--orange-dark)", textTransform: "uppercase" }}>
              {thread.topic_title}
            </span>
            <h1 style={{ fontSize: "24px", margin: "8px 0" }}>{thread.title}</h1>
            <small style={{ color: "var(--muted)" }}>
              Oleh {thread.author.name} • {new Date(thread.created_at).toLocaleDateString("id-ID")}
            </small>
          </header>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: "15px" }}>{thread.content}</p>
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
              <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{r.content}</p>
            </article>
          ))}

          {canPost ? (
            <form
              onSubmit={e => {
                e.preventDefault();
                void handleSendReply(thread);
              }}
              style={{ marginTop: "12px" }}
            >
              <label style={{ display: "grid", gap: "8px" }}>
                <span style={{ fontWeight: 700 }}>Tulis Tanggapan:</span>
                <textarea
                  required
                  rows={3}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Bagikan pandangan atau jawabanmu…"
                  style={{ padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", font: "inherit" }}
                />
              </label>
              <button
                type="submit"
                disabled={replyBusy || !replyText.trim()}
                className="button button-primary"
                style={{ marginTop: "10px" }}
              >
                {replyBusy ? "Mengirim…" : "Kirim Tanggapan"}
              </button>
            </form>
          ) : (
            <p role="status" style={{ color: "var(--muted)", fontStyle: "italic" }}>
              Free Member dapat membaca diskusi. Upgrade ke Belajar Mandiri atau Sensei untuk membalas.
            </p>
          )}
        </section>
      </div>
    );
  }

  // 2. Create Thread View
  if (viewMode === "create") {
    return (
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "16px 0" }}>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setViewMode("list")}
          style={{ marginBottom: "20px", display: "inline-flex", alignItems: "center", gap: "8px" }}
        >
          <LuArrowLeft aria-hidden="true" /> Batal &amp; Kembali
        </button>

        <header className="supporting-header">
          <p className="dash-kicker">BUAT POSTINGAN</p>
          <h1>Bagikan pertanyaan atau pengalaman belajar</h1>
        </header>

        {createError && <p role="alert" style={{ color: "#c65b4b" }}>{createError}</p>}

        <form onSubmit={handleCreateThread} style={{ display: "grid", gap: "16px", marginTop: "20px" }}>
          <label style={{ display: "grid", gap: "8px", fontWeight: 700 }}>
            <span>Kategori Topik</span>
            <select
              value={newTopicId ?? topicsReq.data?.[0]?.id ?? ""}
              onChange={e => setNewTopicId(Number(e.target.value))}
              style={{ padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", background: "#fff", font: "inherit" }}
            >
              {(topicsReq.data ?? []).map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "8px", fontWeight: 700 }}>
            <span>Judul Diskusi</span>
            <input
              required
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Tulis judul yang jelas dan spesifik"
              style={{ padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", font: "inherit" }}
            />
          </label>

          <label style={{ display: "grid", gap: "8px", fontWeight: 700 }}>
            <span>Isi Postingan</span>
            <textarea
              required
              rows={6}
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="Ceritakan pertanyaan atau topik yang ingin didiskusikan…"
              style={{ padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", font: "inherit" }}
            />
          </label>

          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            <button
              type="submit"
              disabled={createBusy || !newTitle.trim() || !newContent.trim()}
              className="button button-primary"
            >
              {createBusy ? "Mempublikasikan…" : "Publikasikan Postingan"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setViewMode("list")}
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    );
  }

  // 3. Thread List View
  return (
    <>
      <div className="progress-title-row">
        <header className="supporting-header">
          <p className="dash-kicker">FORUM KOMUNITAS</p>
          <h1>Berdiskusi, bertanya, dan berbagi perjalanan belajar</h1>
          <p>
            {membership === "sensei"
              ? "Belajar dengan Sensei dapat membuat post, membalas komentar, dan menggunakan Tanya Sensei."
              : membership === "lms"
              ? "Belajar Mandiri dapat membuat post, membalas komentar, dan berdiskusi di forum."
              : "Free Member dapat membaca seluruh diskusi aktif. Post dan komentar terbuka setelah upgrade."}
          </p>
        </header>
        {canPost && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => setViewMode("create")}
          >
            Buat Postingan
          </button>
        )}
      </div>

      <section className="community-access-grid" style={{ margin: "20px 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
        {(topicsReq.data ?? []).map(topic => {
          const isSelected = selectedTopicSlug === topic.slug;
          return (
            <article
              key={topic.id}
              onClick={() => setSelectedTopicSlug(isSelected ? "all" : topic.slug)}
              style={{
                padding: "16px 20px",
                borderRadius: "14px",
                border: isSelected ? "2px solid var(--orange)" : "1px solid var(--line)",
                background: isSelected ? "#fff7ef" : "#fff",
                cursor: "pointer",
              }}
            >
              <strong style={{ fontSize: "15px", display: "block", marginBottom: "4px" }}>{topic.title}</strong>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>{topic.description}</p>
            </article>
          );
        })}
      </section>

      <section className="community-feed-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 16px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <p className="dash-kicker" style={{ margin: 0 }}>DISKUSI TERBARU</p>
          <small style={{ color: "var(--muted)" }}>Aktivitas diskusi pembelajar aktif.</small>
        </div>
        <label className="library-search" style={{ minWidth: "280px" }}>
          <span aria-hidden="true"><LuSearch /></span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari diskusi atau topik…"
          />
        </label>
      </section>

      {threadsReq.loading && <p role="status">Memuat diskusi…</p>}
      {threadsReq.error && <p role="alert">{threadsReq.error}</p>}

      <section className="community-list" style={{ display: "grid", gap: "14px" }}>
        {(threadsReq.data ?? []).map(thread => (
          <article
            key={thread.id}
            onClick={() => setSelectedThreadId(thread.id)}
            style={{
              padding: "20px 24px",
              borderRadius: "16px",
              border: "1px solid var(--line)",
              background: "#fff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
              gap: "16px",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "var(--orange-dark)",
                  background: "var(--soft)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  display: "inline-block",
                  marginBottom: "8px",
                }}
              >
                {thread.topic_title}
              </span>
              <h2 style={{ fontSize: "18px", margin: "0 0 6px", fontWeight: 800 }}>{thread.title}</h2>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px", lineHeight: 1.4 }}>
                {thread.content.length > 120 ? `${thread.content.slice(0, 120)}…` : thread.content}
              </p>
              <small style={{ display: "block", marginTop: "8px", color: "var(--muted)", fontSize: "11px" }}>
                {thread.author.name} • {new Date(thread.created_at).toLocaleDateString("id-ID")}
              </small>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
              <span style={{ fontSize: "12px", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <LuMessagesSquare aria-hidden="true" />
                {thread.replies_count}
              </span>
              <button type="button" className="button button-primary" style={{ padding: "6px 16px" }}>
                Buka
              </button>
            </div>
          </article>
        ))}

        {!threadsReq.loading && (threadsReq.data ?? []).length === 0 && (
          <div className="library-empty">
            <h2>Belum ada diskusi</h2>
            <p>Jadilah yang pertama membuat postingan di komunitas.</p>
          </div>
        )}
      </section>
    </>
  );
}
