"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import "./student-community.css";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { LuArrowLeft, LuMessagesSquare, LuSearch, LuSend } from "react-icons/lu";
import { useAuth } from "@/components/auth-provider";
import { useLearningRequest } from "@/components/learning-hooks";
import {
  fetchCommunityTopics,
  fetchCommunityRoom,
  fetchCommunityMessages,
  sendCommunityMessage,
  reportCommunityMessage,
  type CommunityMessage,
  type CommunityTopic,
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
  const params = useSearchParams();
  const [topicId, setTopicId] = useState<number>();
  const [search, setSearch] = useState("");
  const [mobileChat, setMobileChat] = useState(() => !!params.get("topic"));
  const [pending, setPending] = useState<Record<number, PendingMessage>>({});
  const load = useCallback((signal: AbortSignal) => fetchCommunityTopics(signal), []);
  const topics = useLearningRequest(load, "community-chat-topics");
  const selected = topics.data?.find(topic => topic.id === topicId)
    ?? topics.data?.find(topic => topic.slug === params.get("topic"))
    ?? topics.data?.find(topic => topic.slug !== "tanya-sensei")
    ?? topics.data?.[0];

  const filtered = (topics.data ?? []).filter(topic => `${topic.title} ${topic.description ?? ""}`.toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID")));
  return <section className={`community-chat-page${mobileChat ? " community-mobile-chat" : ""}`} aria-label="Komunitas">
    <aside className="community-group-panel">
      <header className="community-group-heading"><h1>Komunitas</h1><p>Terhubung, belajar, dan berbagi bersama.</p></header>
      <label className="community-group-search"><LuSearch aria-hidden="true" /><input aria-label="Cari grup" placeholder="Cari grup…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <section className="community-group-list" aria-label="Kategori diskusi">
        {!topics.data && !topics.error && <LoadingSkeleton variant="list" label="Memuat kategori…" />}
        {topics.error && <p role="alert">{topics.error} <button type="button" onClick={topics.retry}>Coba Lagi Kategori</button></p>}
        {filtered.map(topic => {
          const content = <><span className="community-group-avatar" aria-hidden="true"><LuMessagesSquare /></span><span className="community-group-copy"><strong>{topic.title}</strong><span>{topic.description}</span></span></>;
          return <button type="button" key={topic.id} aria-pressed={selected?.id === topic.id} onClick={() => { setTopicId(topic.id); setMobileChat(true); }}>{content}</button>;
        })}
        {topics.data && !filtered.length && <p className="community-list-empty" role="status">{search ? "Grup tidak ditemukan." : "Belum ada kategori komunitas."}</p>}
      </section>
    </aside>
    {selected && user ? <CommunityConversation key={`${user.id}-${selected.id}`} topic={selected} userId={Number(user.id)} canPost={(selected.slug === "tanya-sensei" ? membership === "sensei" : membership !== "free") || user.role === "admin"} onBack={() => setMobileChat(false)}
      pending={pending[selected.id]} onPending={value => setPending(current => {
        const next = { ...current };
        if (value) next[selected.id] = value; else delete next[selected.id];
        return next;
      })} /> : <div className="community-chat-welcome"><span className="community-welcome-icon"><LuMessagesSquare aria-hidden="true" /></span><h2>Ruang untuk tumbuh bersama</h2><p>Pilih grup untuk membaca pesan dan ikut percakapan.</p></div>}
  </section>;
}

function CommunityConversation({ topic, userId, canPost, pending, onPending, onBack }: {
  topic: CommunityTopic; userId: number; canPost: boolean; pending?: PendingMessage; onPending: (value?: PendingMessage) => void; onBack: () => void;
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
    <header className="community-room-header"><button type="button" className="community-chat-back" aria-label="Kembali ke daftar grup" onClick={onBack}><LuArrowLeft aria-hidden="true" /></button><span className="community-group-avatar" aria-hidden="true"><LuMessagesSquare /></span><div><h2>{topic.title}</h2><p>{topic.description}</p><small>Sinkronisasi berkala</small></div></header>
    {error && <p role="alert" className="community-chat-error">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Coba Lagi Percakapan</button></p>}
    <div ref={history} className="community-chat-history" role="region" aria-label="Riwayat pesan" tabIndex={0} onScroll={() => {
      const box = history.current!; nearBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    }}>
      {!ready && !error && <div className="community-history-state" role="status"><LoadingSkeleton variant="list" label="Memuat percakapan…" /></div>}
      {hasOlder && <button type="button" className="button button-secondary community-older" disabled={olderBusy} onClick={() => void loadOlder()}>{olderBusy ? "Memuat pesan lama…" : "Muat Pesan Lama"}</button>}
      {ready && messages.length === 0 && <div className="community-history-state" role="status"><LuMessagesSquare aria-hidden="true" /><h3>Belum ada pesan</h3><p>Percakapan di {topic.title} akan tampil di sini.</p></div>}
      {messages.map(message => <article key={message.id} data-message-id={message.id} className={`community-bubble ${message.author.id === userId ? "community-bubble-own" : "community-bubble-other"}`}>
        <strong>{message.author.name}</strong>
        <p>{message.content}</p>
        <footer className="community-bubble-footer">
          <MessageReport messageId={message.id} />
          <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })}</time>
        </footer>
      </article>)}
    </div>
    <div className="community-chat-composer">
      {pending && <div className="community-pending" role="status"><p>{pending.content}</p><span>{sending ? "Mengirim…" : "Belum terkonfirmasi. Pesan mungkin sudah tersimpan; coba lagi dengan pesan yang sama."}</span></div>}
      {sendError && <p role="alert">{sendError}</p>}
      {showComposer ? <form onSubmit={event => { event.preventDefault(); void send(); }}>
        <label><span className="community-input-label">Pesan</span><textarea aria-label="Pesan" rows={2} maxLength={5000} value={text} disabled={!!pending} onChange={event => setText(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
        }} placeholder={`Tulis pesan ke ${topic.title}…`} /></label>
        <small>{text.length}/5.000 · Shift+Enter untuk baris baru</small>
        <button className="button button-primary" type="submit" disabled={!ready || sending || (!pending && !text.trim())}><LuSend aria-hidden="true" />{sending ? "Mengirim…" : pending ? "Coba Lagi Kirim" : "Kirim"}</button>
      </form> : <div><p role="status">{topic.slug === "tanya-sensei" ? "Grup Tanya Sensei khusus membership Sensei, pengajar, dan admin." : "Free Member dapat membaca diskusi. Upgrade ke Belajar Mandiri atau Sensei untuk mengirim pesan."}</p><button type="button" className="button button-secondary" onClick={() => setInstructorAttempt(true)}>Saya pengajar — gunakan otorisasi backend</button><small>Form pengajar tidak memberi akses tambahan. Server tetap memeriksa hak kirim.</small></div>}
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
