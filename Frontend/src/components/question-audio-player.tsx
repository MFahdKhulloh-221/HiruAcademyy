"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, apiRequest } from "@/lib/api";
import styles from "./question-audio-player.module.css";

type Status = "loading" | "idle" | "playing" | "used" | "error";
type AudioGrant = { data: { status: "available" | "reserved" | "used"; token?: string } };

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

    async function checkStatus() {
      if (disposed || disabled) return;
      if (!latestSrc.current) {
        setStatus("error");
        setMessage("Audio gagal dimuat. Coba lagi.");
        return;
      }
      setStatus("loading");
      setMessage("Memeriksa izin audio…");
      try {
        const { data } = await apiRequest<AudioGrant>(endpoint, { signal: controller.signal, cache: "no-store" });
        if (disposed) return;
        if (data.status === "available" && !committed) {
          commitRequested = false;
          token = null;
          setStatus("idle");
          setMessage("Siapkan volume sebelum memutar audio. Audio hanya dapat diputar satu kali.");
        } else if (data.status === "used" || committed) {
          setStatus("used");
          setMessage("Kesempatan mendengarkan sudah digunakan.");
        } else {
          setStatus("error");
          setMessage("Audio sedang digunakan. Periksa kembali izin audio sebelum melanjutkan.");
        }
      } catch {
        if (disposed) return;
        setStatus("error");
        setMessage("Izin audio belum dapat diperiksa. Periksa koneksi, lalu coba lagi.");
      }
    }

    function preload() {
      return new Promise<void>((resolve, reject) => {
        function finish(error?: Error) {
          clearTimeout(timer);
          audio!.removeEventListener("canplaythrough", ready);
          audio!.removeEventListener("error", failed);
          cancelPreload = undefined;
          if (error) reject(error); else resolve();
        }
        function ready() { finish(); }
        function failed() { finish(new Error("Audio gagal dimuat.")); }
        cancelPreload = () => finish(new Error("Pemutaran dibatalkan."));
        const timer = setTimeout(failed, 30000);
        audio!.addEventListener("canplaythrough", ready);
        audio!.addEventListener("error", failed);
        audio!.preload = "auto";
        if (audio!.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) ready();
        else audio!.load();
      });
    }

    async function play() {
      if (disposed || disabled || busy || committed || commitRequested) return;
      busy = true;
      setStatus("loading");
      setMessage("Menyiapkan audio…");
      try {
        if (audio!.getAttribute("src") !== latestSrc.current) audio!.src = latestSrc.current;
        await preload();
        if (disposed) return;
        token = crypto.randomUUID();
        const { data } = await apiRequest<AudioGrant>(`${endpoint}/reserve`, {
          method: "POST", body: JSON.stringify({ token }),
        });
        if (disposed) { await release(); return; }
        if (data.status !== "reserved") {
          token = null;
          await checkStatus();
          return;
        }
        audio!.muted = true;
        audio!.playbackRate = 1;
        await audio!.play();
      } catch (error) {
        stop();
        if (!commitRequested) await release();
        if (disposed) return;
        if (commitRequested || (error instanceof ApiError && error.status === 409)) {
          await checkStatus();
        } else {
          setStatus("error");
          setMessage("Audio gagal dimuat. Coba lagi.");
        }
      } finally {
        busy = false;
      }
    }

    async function playing() {
      if (disposed || !token || commitRequested) return;
      commitRequested = true;
      audio!.pause();
      try {
        const { data } = await apiRequest<AudioGrant>(`${endpoint}/commit`, {
          method: "POST", body: JSON.stringify({ token }),
        });
        if (disposed) return;
        if (data.status !== "used") throw new Error("Audio grant rejected");
        committed = true;
        audio!.currentTime = 0;
        audio!.volume = volumeRef.current;
        audio!.muted = false;
        await audio!.play();
        if (disposed) { stop(); return; }
        setStatus("playing");
        setMessage("Dengarkan audio dengan saksama.");
      } catch {
        stop();
        if (!disposed) await checkStatus();
      }
    }

    function metadata() {
      if (!disposed) setDuration(Number.isFinite(audio!.duration) ? audio!.duration : 0);
    }
    function progress() { if (!disposed && committed) setElapsed(audio!.currentTime); }
    function ended() {
      stop();
      if (disposed || !committed) return;
      setStatus("used");
      setMessage("Kesempatan mendengarkan sudah digunakan.");
    }
    function failed() {
      stop();
      if (disposed || !committed) return;
      setStatus("used");
      setMessage("Pemutaran audio terhenti. Audio telah diputar dan tidak dapat diulang.");
    }
    function rate() { if (audio!.playbackRate !== 1) audio!.playbackRate = 1; }
    function pagehide() {
      disposed = true;
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
      <label className={styles.volume}>
        Volume
        <input type="range" min="0" max="1" step="0.05" value={volume} disabled={disabled} aria-label="Volume audio" onChange={event => {
          const next = Number(event.target.value);
          volumeRef.current = next;
          setVolume(next);
          if (audioRef.current) audioRef.current.volume = next;
        }} />
      </label>
      <p className={`${styles.status} ${status === "error" ? styles.error : ""}`} role="status" aria-live="polite">
        {disabled ? "Audio tidak tersedia karena sesi tidak aktif." : message}
      </p>
      {!disabled && status === "error" && <button type="button" className={styles.retry} onClick={() => actions.current.retry()}>Coba Lagi</button>}
    </section>
  );
}
