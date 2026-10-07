"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LuCheck, LuRotateCcw, LuZap } from "react-icons/lu";
import type { FlashcardItem } from "@/lib/learning-mock";
import type { Membership } from "@/lib/dashboard-mock";
import { useRef } from "react";

function shuffled(cards: FlashcardItem[]) {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function FlashcardSession({ cards, membership, level, chapter, onComplete }: { cards: FlashcardItem[]; membership: Membership; level: string; chapter: string; onComplete?: () => Promise<void> }) {
  const initialDeck = useMemo(() => shuffled(cards), [cards]);
  const [deck, setDeck] = useState(initialDeck);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [difficult, setDifficult] = useState<FlashcardItem[]>([]);
  const [easyCount, setEasyCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const card = deck[index];
  const overviewHref = `/learn/${level}/${chapter}?membership=${membership}`;

  const pending = useRef(false);
  const persisted = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveCompletion() {
    if (pending.current || persisted.current) return;
    pending.current = true;
    setSaving(true); setError("");
    try {
      if (!onComplete) throw new Error("Progress belum tersedia.");
      await onComplete();
      persisted.current = true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi.");
    } finally { pending.current = false; setSaving(false); }
  }

  function rate(outcome: "difficult" | "easy") {
    if (!card || !flipped || completed) return;
    setDifficult(current => outcome === "difficult" && !current.some(item => item.id === card.id) ? [...current, card] : current.filter(item => outcome !== "easy" || item.id !== card.id));
    if (outcome === "easy") setEasyCount(value => value + 1);
    setFlipped(false);
    if (index === deck.length - 1) { setCompleted(true); void saveCompletion(); }
    else setIndex(value => value + 1);
  }

  function retryDifficult() {
    if (!difficult.length || pending.current) return;
    setDeck(shuffled(difficult));
    setIndex(0);
    setFlipped(false);
    setDifficult([]);
    setEasyCount(0);
    setCompleted(false);
  }

  if (!card && !completed) return <div className="flashcard-session"><p role="status">Belum tersedia</p><button className="flashcard-action-secondary" type="button" disabled>Ulangi Kartu Sulit</button></div>;

  if (completed) return <div className="flashcard-complete"><header><p className="dash-kicker">FLASHCARD SELESAI</p><h1>Deck Chapter {chapter.replace("chapter-", "")} sudah ditinjau</h1><p>Kartu yang sulit dapat diulang sebelum kembali ke aktivitas chapter.</p></header><section className="flashcard-complete-summary"><div><ruby>日本語<rt>にほんご</rt></ruby><span>Klik untuk melihat arti</span></div><div><strong>{deck.length} kartu selesai</strong><p>Ulangi kartu yang ditandai Sulit atau kembali ke aktivitas chapter.</p></div></section><section className="flashcard-confidence-summary"><div><strong>{deck.length}</strong><span>Dipelajari</span></div><div><strong>{easyCount}</strong><span>Mudah</span></div><div><strong>{difficult.length}</strong><span>Sulit</span></div></section><div className="flashcard-complete-actions"><Link className="flashcard-action-primary" href={overviewHref}>Kembali ke Aktivitas Chapter</Link><button className="flashcard-action-secondary" type="button" onClick={retryDifficult} disabled={!difficult.length}><LuRotateCcw aria-hidden="true" /> Ulangi Kartu Sulit</button></div>{difficult.length > 0 && <section className="flashcard-difficult"><h2>Kartu yang perlu diulang</h2><div>{difficult.map((item) => <article key={item.id}><ruby>{item.term}<rt>{item.reading}</rt></ruby><span>Klik untuk melihat arti</span></article>)}</div></section>}<aside><strong>Pengumuman</strong>{saving ? <p role="status">Memuat materi...</p> : error ? <><p role="alert">{error}</p><button type="button" onClick={() => void saveCompletion()}>Coba Lagi</button></> : <p>{difficult.length ? "Progress deck disimpan. Kartu sulit siap diulang." : "Semua kartu selesai tanpa kartu sulit."}</p>}</aside></div>;

  return <div className="flashcard-session"><style>{`.flashcard-session .flashcard-inner{transition:transform 600ms ease-in-out}@media(prefers-reduced-motion:reduce){.flashcard-session .flashcard-inner{transition:none}}`}</style><header className="flashcard-head"><div className="flash-progress"><strong>{index + 1} dari {deck.length} kartu</strong><i><b style={{ width: `${((index + 1) / deck.length) * 100}%` }} /></i></div></header><div className={`flashcard-surface${flipped ? " flipped" : ""}`} role="button" tabIndex={0} onClick={() => setFlipped((value) => !value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFlipped((value) => !value); } }} aria-pressed={flipped}><div className="flashcard-inner"><div className="flash-face flash-front"><small>Japanese</small><ruby>{card.term}<rt>{card.reading}</rt></ruby></div><div className="flash-face flash-back"><span className="back-word"><small>Arti</small><strong>{card.meaning}</strong></span><span className="example-block"><small>Contoh kalimat</small><span className="example-japanese">{card.example.before}<ruby>{card.example.focus}<rt>{card.example.focusReading}</rt></ruby>{card.example.after}</span><em>{card.example.translation}</em></span></div></div></div>{error && <p role="alert">{error}</p>}<button className="flashcard-action-secondary" type="button" onClick={retryDifficult} disabled={!completed || !difficult.length || saving}>Ulangi Kartu Sulit</button><div className="flashcard-confidence" role="group" aria-label="Tingkat keyakinan"><button type="button" disabled={!flipped || saving} onClick={() => void rate("difficult")}><LuZap aria-hidden="true" /> Sulit</button><button type="button" disabled={!flipped || saving} onClick={() => void rate("easy")}><LuCheck aria-hidden="true" /> Mudah</button></div></div>;
}
