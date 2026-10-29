"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import "./student-community.css";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { LuArrowLeft, LuMessagesSquare, LuSearch } from "react-icons/lu";
import { useAuth } from "@/components/auth-provider";
import { useLearningRequest } from "@/components/learning-hooks";
import {
  createCommunityReply,
  createCommunityThread,
  fetchCommunityThread,
  fetchCommunityThreads,
  fetchCommunityTopics,
  fetchCommunityRoom,
  fetchCommunityMessages,
  sendCommunityMessage,
  reportCommunityMessage,
  type CommunityMessage,
  type CommunityTopic,
  type CommunityThread,
} from "@/lib/community-api";
import type { Membership } from "@/lib/dashboard-mock";

type PendingMessage = { client_message_id: string; content: string };

function chatError(cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.status === 403) return "Akses kirim ditolak. Periksa membership akun.";
    if (cause.status === 404) return "Ruang atau pesan tidak tersedia.";
    if (cause.status === 409) return "Konflik pesan (409). Kunci pesan sudah dipakai dengan isi berbeda. Jangan kirim ulang sebagai pesan baru sebelum memeriksa riwayat.";
    if (cause.status === 0) return "Koneksi terputus. Status pengiriman belum dapat dipastikan.";
    return cause.message;
  }
  return "Permintaan belum berhasil. Coba lagi.";
}

export function StudentCommunityScreen({ membership }: { membership: Membership }) {
  const { user } = useAuth();
  return user ? <CommunitySession key={String(user.id)} membership={membership} /> : null;
}

function CommunitySession({ membership }: { membership: Membership }) {
  const { user } = useAuth();
  const [archive, setArchive] = useState(false);
  const [topicId, setTopicId] = useState<number>();
  const [pending, setPending] = useState<Record<number, PendingMessage>>({});
  const load = useCallback((signal: AbortSignal) => fetchCommunityTopics(signal), []);
  const topics = useLearningRequest(load, "community-chat-topics");
  const selected = topics.data?.find(topic => topic.id === topicId && topic.slug !== "tanya-sensei");

  if (archive) return <><button className="button button-secondary" type="button" onClick={() => setArchive(false)}>Kembali ke Grup Chat</button><CommunityArchive membership={membership} /></>;

  return <section className="community-chat-page">
    <header className="supporting-header">
      <p className="dash-kicker">KOMUNITAS</p>
      <h1>Diskusi Member Kerja ke Jepang</h1>
      <p>Pilih kategori untuk membuka percakapan grup.</p>
      <button type="button" className="button button-secondary" onClick={() => setArchive(true)}>Arsip Diskusi Lama</button>
    </header>
    {!topics.data && !topics.error && <LoadingSkeleton variant="cards" label="Memuat kategori…" />}
    {topics.error && <p role="alert">{topics.error} <button type="button" onClick={topics.retry}>Coba Lagi Kategori</button></p>}
    <section className="community-access-grid community-category-menu" aria-label="Kategori diskusi">
      {(topics.data ?? []).map(topic => topic.slug === "tanya-sensei"
        ? <Link className="button button-secondary" key={topic.id} href="/ask-sensei">{topic.title}</Link>
        : <button type="button" key={topic.id} aria-pressed={topicId === topic.id} onClick={() => setTopicId(topic.id)}><strong>{topic.title}</strong><span>{topic.description}</span></button>)}
    </section>
    {topics.data?.length === 0 && <p role="status">Belum ada kategori komunitas.</p>}
    {selected && user ? <CommunityConversation key={`${user.id}-${selected.id}`} topic={selected} userId={Number(user.id)} canPost={membership !== "free" || user.role === "admin"}
      pending={pending[selected.id]} onPending={value => setPending(current => {
        const next = { ...current };
        if (value) next[selected.id] = value; else delete next[selected.id];
        return next;
      })} /> : topics.data && <p role="status">Pilih ruang percakapan di atas.</p>}
  </section>;
}

function CommunityConversation({ topic, userId, canPost, pending, onPending }: {
  topic: CommunityTopic; userId: number; canPost: boolean; pending?: PendingMessage; onPending: (value?: PendingMessage) => void;
}) {
  const [roomId, setRoomId] = useState<number>();
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [instructorAttempt, setInstructorAttempt] = useState(false);
  const showComposer = canPost || instructorAttempt;
  const confirmedVersion = useRef(0);
  const [olderBusy, setOlderBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const history = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const oldest = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  const active = useRef<AbortController | null>(null);
  const sendLock = useRef(false);
  const pendingRef = useRef(pending);
  const onPendingRef = useRef(onPending);
  useLayoutEffect(() => { pendingRef.current = pending; onPendingRef.current = onPending; });

  function rememberScroll() {
    const box = history.current;
    if (!box || nearBottom.current) return;
    const visible = Array.from(box.querySelectorAll<HTMLElement>("[data-message-id]")).find(el => el.getBoundingClientRect().bottom >= box.getBoundingClientRect().top);
    if (visible) anchor.current = { id: visible.dataset.messageId!, offset: visible.getBoundingClientRect().top - box.getBoundingClientRect().top };
  }

  useLayoutEffect(() => {
    const box = history.current;
    if (!box) return;
    if (anchor.current) {
      const el = box.querySelector<HTMLElement>(`[data-message-id="${anchor.current.id}"]`);
      if (el) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - anchor.current.offset;
      anchor.current = null;
    } else if (nearBottom.current) box.scrollTop = box.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    async function synchronize() {
      // Let development effect cleanup abort before acquiring the shared request lock.
      await Promise.resolve();
      if (controller.signal.aborted) return;
      if (inFlight.current || document.hidden) { timer = setTimeout(synchronize, 5000); return; }
      inFlight.current = true;
      try {
        const version = confirmedVersion.current;
        const room = await fetchCommunityRoom(topic.id, controller.signal);
        setRoomId(room.id);
        // Refresh the entire loaded ID range, not just new IDs: moderation may remove older bubbles.
        let page = await fetchCommunityMessages(room.id, undefined, controller.signal);
        let rows = page.data;
        const floor = oldest.current;
        while (floor && page.meta.has_more && page.meta.before && page.meta.before > floor) {
          page = await fetchCommunityMessages(room.id, page.meta.before, controller.signal);
          rows = [...page.data, ...rows];
        }
        controller.signal.throwIfAborted();
        // A snapshot started before a POST confirmation cannot replace that confirmation.
        // Next scheduled refresh still reconciles removals, including moderator-hidden messages.
        if (version !== confirmedVersion.current) return;
        const unique = [...new Map(rows.filter(item => item.room_id === room.id && item.status === "published").map(item => [item.id, item])).values()].sort((a, b) => a.id - b.id);
        rememberScroll();
        oldest.current = unique[0]?.id;
        setMessages(unique);
        setHasOlder(page.meta.has_more);
        setReady(true);
        setError("");
        const waiting = pendingRef.current;
        if (waiting && unique.some(item => item.author.id === userId && item.client_message_id === waiting.client_message_id && item.content === waiting.content)) {
          onPendingRef.current(undefined);
          setSendError("");
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(chatError(cause));
      } finally {
        inFlight.current = false;
        if (!controller.signal.aborted) timer = setTimeout(synchronize, 5000);
      }
    }
    void synchronize();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [topic.id, userId, revision]);

  async function loadOlder() {
    if (!roomId || inFlight.current || !oldest.current || olderBusy) return;
    inFlight.current = true;
    setOlderBusy(true);
    const signal = active.current?.signal;
    try {
      const page = await fetchCommunityMessages(roomId, oldest.current, signal);
      signal?.throwIfAborted();
      nearBottom.current = false;
      rememberScroll();
      setMessages(current => [...new Map([...page.data.filter(item => item.room_id === roomId && item.status === "published"), ...current].map(item => [item.id, item])).values()].sort((a, b) => a.id - b.id));
      oldest.current = page.data[0]?.id ?? oldest.current;
      setHasOlder(page.meta.has_more);
      setError("");
    } catch (cause) { if (!signal?.aborted) setError(chatError(cause)); }
    finally { inFlight.current = false; setOlderBusy(false); }
  }

  async function send() {
    if (!roomId || !showComposer || sendLock.current || (!pending && !text.trim())) return;
    const message = pending ?? { client_message_id: crypto.randomUUID(), content: text.trim() };
    if (message.content.length > 5000) return;
    sendLock.current = true;
    onPending(message);
    if (!pending) setText("");
    setSending(true);
    setSendError("");
    const signal = active.current?.signal;
    try {
      const saved = await sendCommunityMessage(roomId, message, signal);
      signal?.throwIfAborted();
      if (saved.room_id !== roomId) throw new Error("Unexpected room");
      confirmedVersion.current += 1;
      rememberScroll();
      setMessages(current => [...new Map([...current, saved].map(item => [item.id, item])).values()].sort((a, b) => a.id - b.id));
      oldest.current ??= saved.id;
      onPending(undefined);
    } catch (cause) {
      if (!signal?.aborted) setSendError(chatError(cause));
    } finally { sendLock.current = false; setSending(false); }
  }

  return <section className="community-conversation" aria-label={`Percakapan ${topic.title}`}>
    <header className="community-room-header"><h2>{topic.title}</h2><small>Grup komunitas · Sinkronisasi berkala</small></header>
    {error && <p role="alert" className="community-chat-error">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Coba Lagi Percakapan</button></p>}
    <div ref={history} className="community-chat-history" role="region" aria-label="Riwayat pesan" tabIndex={0} onScroll={() => {
      const box = history.current!; nearBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    }}>
      {!ready && !error && <p role="status">Memuat percakapan…</p>}
      {hasOlder && <button type="button" className="button button-secondary community-older" disabled={olderBusy} onClick={() => void loadOlder()}>{olderBusy ? "Memuat pesan lama…" : "Muat Pesan Lama"}</button>}
      {ready && messages.length === 0 && <p role="status">Belum ada pesan. Mulai percakapan di ruang ini.</p>}
      {messages.map(message => <article key={message.id} data-message-id={message.id} className={`community-bubble ${message.author.id === userId ? "community-bubble-own" : "community-bubble-other"}`}>
        <strong>{message.author.name}</strong>
        <p>{message.content}</p>
        <MessageReport messageId={message.id} />
        <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })}</time>
      </article>)}
    </div>
    <div className="community-chat-composer">
      {pending && <div className="community-pending" role="status"><p>{pending.content}</p><span>{sending ? "Mengirim…" : "Belum terkonfirmasi. Pesan mungkin sudah tersimpan; coba lagi dengan pesan yang sama."}</span></div>}
      {sendError && <p role="alert">{sendError}</p>}
      {showComposer ? <form onSubmit={event => { event.preventDefault(); void send(); }}>
        <label><span>Pesan</span><textarea aria-label="Pesan" rows={2} maxLength={5000} value={text} disabled={!!pending} onChange={event => setText(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
        }} placeholder="Tulis pesan…" /></label>
        <small>{text.length}/5.000 · Shift+Enter untuk baris baru</small>
        <button className="button button-primary" type="submit" disabled={!ready || sending || (!pending && !text.trim())}>{sending ? "Mengirim…" : pending ? "Coba Lagi Kirim" : "Kirim"}</button>
      </form> : <div><p role="status">Free Member dapat membaca diskusi. Upgrade ke Belajar Mandiri atau Sensei untuk mengirim pesan.</p><button type="button" className="button button-secondary" onClick={() => setInstructorAttempt(true)}>Saya pengajar — gunakan otorisasi backend</button><small>Form pengajar tidak memberi akses tambahan. Server tetap memeriksa hak kirim.</small></div>}
    </div>
  </section>;
}

function MessageReport({ messageId }: { messageId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  return <div>
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} style={{ minHeight: 44 }}>Laporkan</button>
    {open && <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setFeedback("");
      try { await reportCommunityMessage(messageId, reason); setFailed(false); setFeedback("Laporan tersimpan."); setOpen(false); }
      catch { setFailed(true); setFeedback("Laporan gagal disimpan. Coba lagi."); }
      finally { setBusy(false); }
    }}>
      <label>Alasan laporan<textarea required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <button type="submit" disabled={busy || !reason.trim()} style={{ minHeight: 44 }}>{busy ? "Mengirim laporan…" : "Kirim laporan"}</button>
    </form>}
    {feedback && <p role={failed ? "alert" : "status"}>{feedback}</p>}
  </div>;
}

function CommunityArchive({ membership }: { membership: Membership }) {
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
  if (selectedThreadId && !singleReq.data) return singleReq.error ? <p role="alert">{singleReq.error} <button type="button" onClick={singleReq.retry}>Coba Lagi</button><button type="button" onClick={() => setSelectedThreadId(undefined)}>Kembali ke Diskusi</button></p> : <LoadingSkeleton variant="article" />;

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
  if (viewMode === "create" && !topicsReq.data) return topicsReq.error ? <p role="alert">{topicsReq.error} <button type="button" onClick={topicsReq.retry}>Coba Lagi</button><button type="button" onClick={() => setViewMode("list")}>Batal</button></p> : <LoadingSkeleton variant="form" />;

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

      {!topicsReq.data && !topicsReq.error && <LoadingSkeleton variant="cards" label="Memuat kategori…" />}
      {topicsReq.error && <p role="alert">{topicsReq.error} <button type="button" onClick={topicsReq.retry}>Coba Lagi Kategori</button></p>}
      <section className="community-access-grid community-category-menu" aria-label="Kategori diskusi">
        <button type="button" aria-pressed={selectedTopicSlug === "all"} onClick={() => setSelectedTopicSlug("all")}>
          <strong>Semua Diskusi</strong>
          <span>Lihat seluruh kategori diskusi.</span>
        </button>
        {(topicsReq.data ?? []).map(topic => {
          const isSelected = selectedTopicSlug === topic.slug;
          return (
            <button
              type="button"
              key={topic.id}
              aria-pressed={isSelected}
              onClick={() => setSelectedTopicSlug(topic.slug)}
            >
              <strong>{topic.title}</strong>
              <span>{topic.description}</span>
            </button>
          );
        })}
      </section>

      <section className="community-feed-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 16px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <p className="dash-kicker" style={{ margin: 0 }}>DISKUSI TERBARU</p>
          <small style={{ color: "var(--muted)" }}>Aktivitas diskusi pembelajar aktif.</small>
        </div>
        <label className="library-search community-search">
          <span aria-hidden="true"><LuSearch /></span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Cari diskusi"
            placeholder="Cari diskusi atau topik…"
          />
        </label>
      </section>

      {!threadsReq.data && !threadsReq.error && <LoadingSkeleton variant="list" label="Memuat diskusi…" />}
      {threadsReq.error && <p role="alert">{threadsReq.error} <button type="button" onClick={threadsReq.retry}>Coba Lagi</button></p>}

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

        {threadsReq.data && !threadsReq.error && threadsReq.data.length === 0 && (
          <div className="library-empty">
            <h2>Belum ada diskusi</h2>
            <p>Jadilah yang pertama membuat postingan di komunitas.</p>
          </div>
        )}
      </section>
    </>
  );
}
