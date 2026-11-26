"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { LuArrowLeft, LuArrowRight, LuBookOpen, LuBrain, LuCheck, LuLayers3, LuRotateCcw, LuSearch, LuShuffle } from "react-icons/lu";
import type { FlashcardItem } from "@/lib/learning-mock";
import type { Membership } from "@/lib/dashboard-mock";
import styles from "./flashcard-session.module.css";

type Rating = "easy" | "difficult";
type Mode = "all" | "difficult" | "shuffle";

function shuffled(cards: FlashcardItem[]) {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function FlashcardSession({ cards, membership, chapter, chapterNumber, activityCompleted = false, onComplete }: { cards: FlashcardItem[]; membership: Membership; level: string; chapter: string; chapterNumber?: number; activityCompleted?: boolean; onComplete?: () => Promise<void> }) {
  const [deck, setDeck] = useState(cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [view, setView] = useState<"study" | "summary" | "list">("study");
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Rating>("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const persisted = useRef(activityCompleted);
  const ratedCard = useRef<string | null>(null);
  const card = deck[index];
  const difficult = cards.filter(item => ratings[item.id] === "difficult");
  const easyCount = cards.filter(item => ratings[item.id] === "easy").length;
  const studied = easyCount + difficult.length;
  const number = chapterNumber ?? chapter.replace(/^chapter-/, "");

  async function saveCompletion() {
    if (pending.current || persisted.current || activityCompleted) return;
    pending.current = true;
    setSaving(true); setError("");
    try {
      if (!onComplete) throw new Error("Completion unavailable");
      await onComplete();
      persisted.current = true;
    } catch {
      setError("Progres belajar belum berhasil disimpan. Silakan coba lagi.");
    } finally { pending.current = false; setSaving(false); }
  }

  function start(nextMode: Mode) {
    const next = nextMode === "difficult" ? difficult : nextMode === "shuffle" ? shuffled(cards) : [...cards];
    if (!next.length) return;
    setDeck(next); setIndex(0); setFlipped(false); setView("study");
    ratedCard.current = null;
  }

  function rate(outcome: Rating) {
    if (!card || view !== "study" || ratedCard.current === card.id) return;
    ratedCard.current = card.id;
    setRatings(current => ({ ...current, [card.id]: outcome }));
    setFlipped(false);
    if (index === deck.length - 1) {
      setView("summary");
      void saveCompletion();
    } else setIndex(value => value + 1);
  }

  function example(item: FlashcardItem) {
    const text = `${item.example.before}${item.example.focus}${item.example.after}`;
    return text || item.example.translation ? <span className={styles.example}>{text && <span lang="ja">{item.example.before}{item.example.focus && <ruby>{item.example.focus}{item.example.focusReading && <rt>{item.example.focusReading}</rt>}</ruby>}{item.example.after}</span>}{item.example.translation && <span>{item.example.translation}</span>}</span> : null;
  }

  const completionStatus = <>{saving && <p role="status">Menyimpan progres belajar…</p>}{error && <div className={styles.error} role="alert"><p>{error}</p><button type="button" className={styles.secondary} onClick={() => void saveCompletion()} disabled={saving}>Coba Lagi</button></div>}</>;
  const back = <Link className={styles.secondary} href={`/flashcards?membership=${membership}`}><LuArrowLeft aria-hidden="true" />Kembali ke Kumpulan Flashcard</Link>;

  if (!cards.length) return <section className={styles.page}><div className={styles.panel}><h1>Flashcard belum tersedia</h1><p>Kosakata chapter ini belum tersedia untuk dipelajari.</p>{back}</div></section>;

  if (view === "summary") return <section className={styles.page}><div className={styles.panel}>
    <header className={styles.summaryHeader}><span className={styles.successIcon}><LuCheck aria-hidden="true" /></span><span className={styles.eyebrow}>FLASHCARD · CHAPTER {number}</span><h1>Hebat, kamu sudah belajar!</h1><p>Makin sering diulang, makin mudah kamu ingat kosakatanya.</p></header>
    <div className={styles.stats}><div><LuLayers3 aria-hidden="true" /><strong>{studied}</strong><span>Dipelajari</span></div><div><LuCheck aria-hidden="true" /><strong>{easyCount}</strong><span>Mudah</span></div><div><LuBrain aria-hidden="true" /><strong>{difficult.length}</strong><span>Sulit</span></div></div>
    {completionStatus}
    <section className={styles.repeat}><h2>Mau belajar lagi?</h2><p>Pilih cara mengulang yang nyaman untukmu.</p><div className={styles.choices}>
      {difficult.length > 0 && <button className={styles.choice} type="button" onClick={() => start("difficult")}><LuBrain aria-hidden="true" /><span><strong>Ulangi kartu sulit</strong><small>Fokus pada {difficult.length} kartu yang perlu dihafalkan lagi.</small></span><LuArrowRight aria-hidden="true" /></button>}
      <button className={styles.choice} type="button" onClick={() => start("all")}><LuRotateCcw aria-hidden="true" /><span><strong>Ulangi semua kartu</strong><small>Pelajari kembali seluruh {cards.length} kartu dari awal.</small></span><LuArrowRight aria-hidden="true" /></button>
      <button className={styles.choice} type="button" onClick={() => start("shuffle")}><LuShuffle aria-hidden="true" /><span><strong>Acak kartu</strong><small>Latih ingatan tanpa menghafal urutan kartu.</small></span><LuArrowRight aria-hidden="true" /></button>
      <button className={styles.choice} type="button" onClick={() => setView("list")}><LuBookOpen aria-hidden="true" /><span><strong>Lihat daftar kosakata</strong><small>Baca kembali semua kata dan artinya.</small></span><LuArrowRight aria-hidden="true" /></button>
    </div></section><footer className={styles.footer}>{back}</footer>
  </div></section>;

  if (view === "list") {
    const query = search.trim().toLocaleLowerCase("id-ID");
    const visible = cards.filter(item => (filter === "all" || ratings[item.id] === filter) && [item.term, item.reading, item.meaning].some(text => text.toLocaleLowerCase("id-ID").includes(query)));
    return <section className={styles.page}><div className={styles.panel}><button className={styles.secondary} type="button" onClick={() => setView("summary")}><LuArrowLeft aria-hidden="true" />Kembali ke ringkasan</button><header className={styles.listHeader}><h1>Daftar kosakata</h1><p>Chapter {number} · {cards.length} kata</p></header><label className={styles.search}><LuSearch aria-hidden="true" /><span className={styles.srOnly}>Cari kosakata</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari kata atau artinya..." type="search" /></label><div className={styles.filters} role="group" aria-label="Filter hafalan">{([["all", "Semua"], ["easy", "Mudah"], ["difficult", "Sulit"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><div className={styles.words}>{visible.map(item => <article key={item.id}><header><div><h2 lang="ja">{item.term}</h2><p lang="ja">{item.reading}</p></div>{ratings[item.id] && <span className={ratings[item.id] === "easy" ? styles.easyBadge : styles.hardBadge}>{ratings[item.id] === "easy" ? "Mudah" : "Sulit"}</span>}</header><strong>{item.meaning}</strong>{example(item)}</article>)}{!visible.length && <p role="status">Tidak ada kartu yang sesuai.</p>}</div><footer className={styles.listActions}><button className={styles.secondary} type="button" onClick={() => start("all")}><LuRotateCcw aria-hidden="true" />Ulangi semua kartu</button><button className={styles.primary} type="button" onClick={() => start("shuffle")}><LuShuffle aria-hidden="true" />Acak kartu</button></footer></div></section>;
  }

  return <div className={`flashcard-session ${styles.study}`}><style>{`.flashcard-session .flashcard-inner{transition:transform 600ms ease-in-out}@media(prefers-reduced-motion:reduce){.flashcard-session .flashcard-inner{transition:none}}`}</style><header className="flashcard-head"><div className="flash-progress"><strong>{index + 1} dari {deck.length} kartu</strong><i><b style={{ width: `${((index + 1) / deck.length) * 100}%` }} /></i></div></header><div className={`flashcard-surface${flipped ? " flipped" : ""}`} role="button" tabIndex={0} onClick={() => setFlipped((value) => !value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFlipped((value) => !value); } }} aria-pressed={flipped}><div className="flashcard-inner" key={card.id}><div className="flash-face flash-front"><small>Japanese</small><ruby>{card.term}</ruby></div><div className="flash-face flash-back"><span className="back-word"><small>Arti</small><strong>{card.meaning}</strong></span><span className="example-block"><small>Contoh kalimat</small><span className="example-japanese">{card.example.before}<ruby>{card.example.focus}</ruby>{card.example.after}</span><em>{card.example.translation}</em></span></div></div></div>{error && <p role="alert">{error}</p>}<div className={styles.ratingArea}><p>Seberapa baik kamu mengingat kata ini?</p><div className={styles.ratings} role="group" aria-label="Penilaian hafalan"><button className={styles.hard} type="button" disabled={saving} onClick={() => void rate("difficult")}><LuBrain aria-hidden="true" /><span><strong>Masih sulit</strong><small>Perlu diulang</small></span></button><button className={styles.easy} type="button" disabled={saving} onClick={() => void rate("easy")}><LuCheck aria-hidden="true" /><span><strong>Mudah</strong><small>Sudah ingat</small></span></button></div></div></div>;
}
