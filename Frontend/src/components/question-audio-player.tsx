"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, apiRequest } from "@/lib/api";
import styles from "./question-audio-player.module.css";

type Status = "loading" | "idle" | "playing" | "used" | "error";
type AudioGrant = { data: { status: "available" | "reserved" | "used"; expires_at?: string | null } };

type Props = { endpoint: string; src: string; disabled?: boolean };

function clock(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function QuestionAudioPlayer({ endpoint, src, disabled = false }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const actions = useRef({ play: () => {}, retry: () => {} });
  const volumeRef = useRef(1);
  const latestSrc = useRef(src);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Memeriksa izin audio…");
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [volume, setVolume] = useState(1);
  const [pageVersion, setPageVersion] = useState(0);

  useEffect(() => { latestSrc.current = src; }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const controller = new AbortController();
    let disposed = false;
    let busy = false;
    let starting = false;
    let started = false;
    let leaseDeadline = 0;
    let leaseTimer: ReturnType<typeof setTimeout> | undefined;
    let token: string | null = null;
    let commitRequested = false;
    let committed = false;
    let cancelPreload: (() => void) | undefined;

    function stop() {
      audio!.pause();
      audio!.muted = true;
    }

    async function release() {
      if (!token || commitRequested) return;
      const reservedToken = token;
      try {
        await apiRequest(`${endpoint}/release`, { method: "POST", body: JSON.stringify({ token: reservedToken }) });
        if (token === reservedToken) token = null;
      } catch {
        // Server lease remains authoritative when release cannot reach server.
      }
    }

    function preload() {
      return new Promise<void>((resolve, reject) => {
        function finish(error?: Error) {
          clearTimeout(timer);
          audio!.removeEventListener("canplay", ready);
          audio!.removeEventListener("error", failed);
          cancelPreload = undefined;
          if (error) reject(error); else resolve();
        }
        function ready() { finish(); }
        function failed() { finish(new Error("Audio gagal dimuat.")); }
        cancelPreload = () => finish(new Error("Pemutaran dibatalkan."));
        const timer = setTimeout(failed, 30000);
        audio!.addEventListener("canplay", ready);
        audio!.addEventListener("error", failed);
        audio!.preload = "auto";
        if (audio!.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) ready();
        else audio!.load();
      });
    }

    async function checkStatus() {
      if (disposed || disabled || busy || starting || commitRequested) return;
      busy = true;
      clearTimeout(leaseTimer);
      setStatus("loading");
      setMessage("Menyiapkan audio…");
      try {
        await release();
        // A failed release must not discard ownership or acquire a second token.
        if (token && performance.now() < leaseDeadline) throw new Error("Reservation still held");
        token = null;
        const { data } = await apiRequest<AudioGrant>(endpoint, { signal: controller.signal, cache: "no-store" });
        if (disposed) return;
        if (data.status === "used" || committed) {
          setStatus("used");
          setMessage("Kesempatan mendengarkan sudah digunakan.");
          return;
        }
        if (data.status === "reserved") {
          setStatus("error");
          setMessage("Audio sedang digunakan. Periksa kembali izin audio sebelum melanjutkan.");
          return;
        }
        if (!latestSrc.current) throw new Error("Audio unavailable");
        // Keep issued URL stable while prepared/playing; refreshed props are used only on retry.
        if (audio!.getAttribute("src") !== latestSrc.current) audio!.src = latestSrc.current;
        await preload();
        if (disposed) return;
        token = crypto.randomUUID();
        // Server lease is 30 seconds. Monotonic request-start deadline avoids client clock skew.
        leaseDeadline = performance.now() + 25000;
        const grant = await apiRequest<AudioGrant>(`${endpoint}/reserve`, {
          method: "POST", body: JSON.stringify({ token }),
        });
        if (disposed) { await release(); return; }
        if (grant.data.status !== "reserved" || performance.now() >= leaseDeadline) throw new Error("Reservation unavailable");
        setStatus("idle");
        setMessage("");
        leaseTimer = setTimeout(() => { void checkStatus(); }, leaseDeadline - performance.now());
      } catch (error) {
        await release();
        if (disposed) return;
        setStatus("error");
        setMessage(error instanceof ApiError && error.status === 409
          ? "Audio sedang digunakan. Periksa kembali izin audio sebelum melanjutkan."
          : "Audio gagal dimuat. Periksa koneksi, lalu coba lagi.");
      } finally {
        busy = false;
      }
    }

    async function rejected() {
      if (disposed || started) return;
      stop();
      clearTimeout(leaseTimer);
      starting = false;
      await release();
      if (disposed) return;
      setStatus("error");
      setMessage("Audio gagal diputar. Coba lagi.");
    }

    function play() {
      if (disposed || disabled || busy || starting || committed || commitRequested || !token) return;
      if (performance.now() >= leaseDeadline) { void checkStatus(); return; }
      starting = true;
      clearTimeout(leaseTimer);
      leaseTimer = setTimeout(() => { if (!started) void rejected(); }, leaseDeadline - performance.now());
      setStatus("loading");
      setMessage("Menyiapkan audio…");
      audio!.volume = volumeRef.current;
      audio!.playbackRate = 1;
      audio!.muted = false;
      // No await before play: retain browser user activation for this single audible start.
      try { void audio!.play().catch(rejected); } catch { void rejected(); }
    }

    async function playing() {
      if (disposed || !starting || !token || commitRequested) return;
      if (performance.now() >= leaseDeadline) { void rejected(); return; }
      started = true;
      clearTimeout(leaseTimer);
      commitRequested = true;
      setStatus("playing");
      setMessage("Dengarkan audio dengan saksama.");
      const body = JSON.stringify({ token });
      try {
        // ponytail: cooperative playback confirmation; protected streaming needed for proof of sound.
        let grant: AudioGrant;
        try {
          grant = await apiRequest<AudioGrant>(`${endpoint}/commit`, { method: "POST", body });
        } catch (error) {
          stop();
          if (disposed || (error instanceof ApiError && error.status >= 400 && error.status < 500)) throw error;
          // Same token is idempotent: confirm a potentially lost successful response once.
          grant = await apiRequest<AudioGrant>(`${endpoint}/commit`, { method: "POST", body });
        }
        if (grant.data.status !== "used") throw new Error("Audio grant rejected");
        committed = true;
        if (!disposed && audio!.paused) {
          setStatus("used");
          setMessage("Pemutaran audio terhenti. Audio telah diputar dan tidak dapat diulang.");
        }
      } catch {
        stop();
        if (disposed) return;
        // Never offer replay after actual playback, even when confirmation is uncertain.
        setStatus("used");
        setMessage("Pemutaran audio terhenti. Izin audio tidak dapat dikonfirmasi; audio tidak dapat diulang.");
      }
    }

    function metadata() {
      if (!disposed) setDuration(Number.isFinite(audio!.duration) ? audio!.duration : 0);
    }
    function progress() { if (!disposed && started) setElapsed(audio!.currentTime); }
    function ended() {
      stop();
      if (disposed || !started) return;
      setStatus("used");
      setMessage("Kesempatan mendengarkan sudah digunakan.");
    }
    function failed() {
      stop();
      if (disposed) return;
      if (!started) {
        if (starting || (!busy && token)) void rejected();
        return;
      }
      setStatus("used");
      setMessage("Pemutaran audio terhenti. Audio telah diputar dan tidak dapat diulang.");
    }
    function rate() { if (audio!.playbackRate !== 1) audio!.playbackRate = 1; }
    function pagehide() {
      disposed = true;
      clearTimeout(leaseTimer);
      cancelPreload?.();
      stop();
      audio!.removeAttribute("src");
      audio!.load();
      void release();
    }

    function pageshow(event: PageTransitionEvent) {
      if (event.persisted) setPageVersion(value => value + 1);
    }

    audio.src = latestSrc.current;
    audio.muted = true;
    audio.playbackRate = 1;
    audio.addEventListener("playing", playing);
    audio.addEventListener("loadedmetadata", metadata);
    audio.addEventListener("durationchange", metadata);
    audio.addEventListener("timeupdate", progress);
    audio.addEventListener("ended", ended);
    audio.addEventListener("error", failed);
    audio.addEventListener("ratechange", rate);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", pageshow);
    actions.current = { play: () => { void play(); }, retry: () => { void checkStatus(); } };
    if (!disabled) void checkStatus();

    return () => {
      pagehide();
      controller.abort();
      audio.removeEventListener("playing", playing);
      audio.removeEventListener("loadedmetadata", metadata);
      audio.removeEventListener("durationchange", metadata);
      audio.removeEventListener("timeupdate", progress);
      audio.removeEventListener("ended", ended);
      audio.removeEventListener("error", failed);
      audio.removeEventListener("ratechange", rate);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
    };
  }, [endpoint, disabled, pageVersion]);

  return (
    <section className={styles.player} aria-label="Audio soal">
      <audio ref={audioRef} hidden controls={false} loop={false} preload="metadata" />
      <div className={styles.header}>
        <h3 className={styles.title}>{status === "playing" ? "Audio sedang diputar" : status === "used" ? "Audio telah diputar" : "Audio soal"}</h3>
        <span className={styles.note}>Audio hanya dapat diputar satu kali</span>
      </div>
      <div className={styles.controls}>
        <button type="button" className={styles.play} disabled={disabled || status !== "idle"} onClick={() => actions.current.play()}>
          {status === "used" ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg> : <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2v12l10-6z" /></svg>}
          {status === "playing" ? "Sedang diputar" : status === "used" ? "Audio telah diputar" : status === "loading" ? "Memuat…" : "Putar audio"}
        </button>
        <div className={styles.timeline}>
          <span>{clock(elapsed)}</span>
          <progress className={styles.progress} aria-label="Progres audio" value={elapsed} max={duration || 1} />
          <span>{clock(duration)}</span>
        </div>
      </div>
      <div className={styles.volume}>
        <span>Volume</span>
        <input type="range" min="0" max="1" step="0.05" value={volume} disabled={disabled} aria-label="Volume audio" onChange={event => {
          const next = Number(event.target.value);
          volumeRef.current = next;
          setVolume(next);
          if (audioRef.current) audioRef.current.volume = next;
        }} />
      </div>
      {(disabled || message) && <p className={`${styles.status} ${status === "error" ? styles.error : ""}`} role="status" aria-live="polite">
        {disabled ? "Audio tidak tersedia karena sesi tidak aktif." : message}
      </p>}
      {!disabled && status === "error" && <button type="button" className={styles.retry} onClick={() => actions.current.retry()}>Coba Lagi</button>}
    </section>
  );
}
