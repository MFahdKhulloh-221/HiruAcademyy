"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LuCheck, LuRotateCcw, LuZap } from "react-icons/lu";
import type { FlashcardItem } from "@/lib/learning-mock";
import type { Membership } from "@/lib/dashboard-mock";
import { completeChapterActivity } from "@/lib/learning-progress";

function shuffled(cards: FlashcardItem[]) {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function FlashcardSession({ cards, membership, level, chapter }: { cards: FlashcardItem[]; membership: Membership; level: string; chapter: string }) {
  const initialDeck = useMemo(() => shuffled(cards), [cards]);
  const [deck, setDeck] = useState(initialDeck);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [difficult, setDifficult] = useState<FlashcardItem[]>([]);
  const [easyCount, setEasyCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const card = deck[index];
  const overviewHref = `/learn/${level}/${chapter}?membership=${membership}`;

  function rate(outcome: "difficult" | "easy") {
    const nextDifficult = outcome === "difficult" && !difficult.some((item) => item.id === card.id) ? [...difficult, card] : difficult;
    setDifficult(nextDifficult);
    if (outcome === "easy") setEasyCount((value) => value + 1);
    if (index === deck.length - 1) {
      completeChapterActivity(level, chapter, "flashcards");
      setCompleted(true);
      return;
    }
    setIndex((value) => value + 1);
    setFlipped(false);
  }

  function retryDifficult() {
    setDeck(shuffled(difficult));
    setIndex(0);
    setFlipped(false);
    setDifficult([]);
    setEasyCount(0);
    setCompleted(false);
  }

  if (completed) return <div className="flashcard-complete"><header><p className="dash-kicker">FLASHCARD SELESAI</p><h1>Deck Chapter {chapter.replace("chapter-", "")} sudah ditinjau</h1><p>Kartu yang sulit dapat diulang sebelum kembali ke aktivitas chapter.</p></header><section className="flashcard-complete-summary"><div><ruby>日本語<rt>にほんご</rt></ruby><span>Klik untuk melihat arti</span></div><div><strong>{deck.length} kartu selesai</strong><p>Ulangi kartu yang ditandai Sulit atau kembali ke aktivitas chapter.</p></div></section><section className="flashcard-confidence-summary"><div><strong>{deck.length}</strong><span>Dipelajari</span></div><div><strong>{easyCount}</strong><span>Mudah</span></div><div><strong>{difficult.length}</strong><span>Sulit</span></div></section><div className="flashcard-complete-actions"><Link className="flashcard-action-primary" href={overviewHref}>Kembali ke Aktivitas Chapter</Link><button className="flashcard-action-secondary" type="button" onClick={retryDifficult} disabled={!difficult.length}><LuRotateCcw aria-hidden="true" /> Ulangi Kartu Sulit</button></div>{difficult.length > 0 && <section className="flashcard-difficult"><h2>Kartu yang perlu diulang</h2><div>{difficult.map((item) => <article key={item.id}><ruby>{item.term}<rt>{item.reading}</rt></ruby><span>Klik untuk melihat arti</span></article>)}</div></section>}<aside><strong>✓ Pengumuman</strong><p>{difficult.length ? "Progress deck disimpan. Kartu sulit siap diulang." : "Semua kartu selesai tanpa kartu sulit."}</p></aside></div>;

  return <div className="flashcard-session"><header className="flashcard-head"><div className="flash-progress"><strong>{index + 1} dari {deck.length} kartu</strong><i><b style={{ width: `${((index + 1) / deck.length) * 100}%` }} /></i></div></header><div className={`flashcard-surface${flipped ? " flipped" : ""}`} role="button" tabIndex={0} onClick={() => setFlipped((value) => !value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFlipped((value) => !value); } }} aria-pressed={flipped}><div className="flashcard-inner"><div className="flash-face flash-front"><small>Japanese</small><ruby>{card.term}<rt>{card.reading}</rt></ruby></div><div className="flash-face flash-back"><span className="back-word"><small>Arti</small><strong>{card.meaning}</strong></span><span className="example-block"><small>Contoh kalimat</small><span className="example-japanese">{card.example.before}<ruby>{card.example.focus}<rt>{card.example.focusReading}</rt></ruby>{card.example.after}</span><em>{card.example.translation}</em></span></div></div></div><div className="flashcard-confidence" role="group" aria-label="Tingkat keyakinan"><button type="button" onClick={() => rate("difficult")}><LuZap aria-hidden="true" /> Sulit</button><button type="button" onClick={() => rate("easy")}><LuCheck aria-hidden="true" /> Mudah</button></div></div>;
}
