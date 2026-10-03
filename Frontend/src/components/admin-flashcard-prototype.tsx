"use client";

import { useCallback, useState, type FormEvent } from "react";
import { LuSearch } from "react-icons/lu";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import type { FlashcardItem } from "@/lib/learning-mock";

const contexts = ["DASAR", "N5", "N4", "N3", "N2", "N1", "SSW"] as const;
type Card = FlashcardItem & { status: "Draft" | "Published" };
type Deck = { id: string; title: string; context: string; status: "Draft" | "Published"; cards: Card[] };
type DeckDraft = Deck & { order: string };

const approvedCards: Card[] = [
  { id: "learn", term: "学ぶ", reading: "まなぶ", meaning: "belajar / mempelajari", example: { before: "毎日、日本語を", focus: "学", focusReading: "まな", after: "んでいます。", translation: "Saya belajar bahasa Jepang setiap hari." }, status: "Published" },
  { id: "continue", term: "続ける", reading: "つづける", meaning: "melanjutkan", example: { before: "少しずつ勉強を", focus: "続", focusReading: "つづ", after: "けます。", translation: "Saya melanjutkan belajar sedikit demi sedikit." }, status: "Published" },
  { id: "understand", term: "分かる", reading: "わかる", meaning: "mengerti / memahami", example: { before: "例を見ると、意味が", focus: "分", focusReading: "わ", after: "かります。", translation: "Dengan melihat contoh, saya memahami artinya." }, status: "Published" },
  { id: "review", term: "復習", reading: "ふくしゅう", meaning: "mengulang pelajaran", example: { before: "学んだ言葉を", focus: "復習", focusReading: "ふくしゅう", after: "します。", translation: "Saya mengulang kosakata yang sudah dipelajari." }, status: "Published" },
];
const approvedDeck: Deck = { id: "deck-n4-1", title: "Kosakata Rutinitas Harian N4", context: "N4", status: "Published", cards: approvedCards };

function copyDeck(deck: Deck): Deck {
  return { ...deck, cards: deck.cards.map((card) => ({ ...card, example: { ...card.example } })) };
}

function cardError(card: Card) {
  if (!card.term.trim() || !card.reading.trim() || !card.meaning.trim()) return "Isi Japanese, bacaan, dan arti kartu.";
  if (!(card.example.before + card.example.focus + card.example.after).trim() || !card.example.translation.trim()) return "Isi contoh kalimat dan terjemahannya.";
  if (Boolean(card.example.focus.trim()) !== Boolean(card.example.focusReading.trim())) return "Isi teks fokus dan bacaannya bersama, atau kosongkan keduanya.";
  if (!["Draft", "Published"].includes(card.status)) return "Pilih status kartu yang tersedia.";
  return "";
}

function deckError(deck: Deck) {
  if (!deck.title.trim()) return "Judul deck wajib diisi.";
  if (!contexts.some((context) => context === deck.context)) return "Pilih konteks yang tersedia.";
  if (!["Draft", "Published"].includes(deck.status)) return "Pilih status deck yang tersedia.";
  if (!deck.cards.length) return "Deck membutuhkan minimal satu kartu.";
  if (deck.status === "Published" && !deck.cards.some((card) => card.status === "Published")) return "Publish minimal satu kartu sebelum menerbitkan deck.";
  return deck.cards.map(cardError).find(Boolean) ?? "";
}

function FlashcardPreview({ card }: { card: Card }) {
  const [flipped, setFlipped] = useState(false);
  return <section className="admin-flashcard-preview flashcard-session" aria-label="Pratinjau kartu">
    <div className={`flashcard-surface${flipped ? " flipped" : ""}`} role="button" tabIndex={0} aria-label={flipped ? "Tampilkan Japanese" : "Tampilkan arti dan contoh kalimat"} aria-pressed={flipped} onClick={() => setFlipped((value) => !value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFlipped((value) => !value); } }}>
      <div className="flashcard-inner">
        <div className="flash-face flash-front" aria-hidden={flipped}><small>Japanese</small><ruby lang="ja">{card.term}<rt>{card.reading}</rt></ruby></div>
        <div className="flash-face flash-back" aria-hidden={!flipped}><span className="back-word"><small>Arti</small><strong>{card.meaning}</strong></span><span className="example-block"><small>Contoh kalimat</small><span className="example-japanese" lang="ja">{card.example.before}{card.example.focus && <ruby>{card.example.focus}<rt>{card.example.focusReading}</rt></ruby>}{card.example.after}</span><em>{card.example.translation}</em></span></div>
      </div>
    </div>
  </section>;
}

function DeckPreview({ deck }: { deck: Deck }) {
  const [index, setIndex] = useState(0);
  const card = deck.cards[index];
  return <section aria-label="Pratinjau deck"><header className="learning-page-head"><p className="dash-kicker">{deck.context}</p><h2>{deck.title}</h2><AdminStatusBadge status={deck.status} /></header>{card && <><p>{index + 1} dari {deck.cards.length} kartu • {card.status}</p><FlashcardPreview key={card.id} card={card} /><div className="admin-page-actions"><button type="button" className="button" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>Sebelumnya</button><button type="button" className="button" disabled={index === deck.cards.length - 1} onClick={() => setIndex((value) => value + 1)}>Berikutnya</button></div></>}</section>;
}

export function AdminFlashcardPrototype() {
  const [decks, setDecks] = useState<Deck[]>(() => [copyDeck(approvedDeck)]);
  const [draft, setDraft] = useState<DeckDraft | null>(null);
  const [cardId, setCardId] = useState("");
  const [view, setView] = useState<Deck | null>(null);
  const [deleting, setDeleting] = useState<Deck | null>(null);
  const [search, setSearch] = useState("");
  const [context, setContext] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const query = search.trim().toLowerCase();
  const visible = decks.filter((deck) => (!context || deck.context === context) && (!status || deck.status === status) && [deck.title, deck.context, ...deck.cards.flatMap((card) => [card.term, card.reading, card.meaning, card.example.before + card.example.focus + card.example.after, card.example.translation])].some((value) => value.toLowerCase().includes(query)));
  const card = draft?.cards.find((item) => item.id === cardId);

  function edit(deck: Deck) {
    setDraft({ ...copyDeck(deck), order: String(decks.findIndex((item) => item.id === deck.id) + 1 || decks.length + 1) });
    setCardId(deck.cards[0]?.id ?? ""); setError("");
  }

  function updateCard(patch: Partial<Card>) {
    setDraft((current) => current ? { ...current, cards: current.cards.map((item) => item.id === cardId ? { ...item, ...patch } : item) } : current);
    setError("");
  }

  function addCard() {
    if (!draft) return;
    const next: Card = { id: crypto.randomUUID(), term: "", reading: "", meaning: "", example: { before: "", focus: "", focusReading: "", after: "", translation: "" }, status: "Draft" };
    setDraft({ ...draft, cards: [...draft.cards, next] }); setCardId(next.id); setError("");
  }

  function generateFurigana() {
    if (!card) return;
    const known = approvedCards.find((item) => item.term === card.term);
    if (!known) { setError("Bacaan belum tersedia untuk kata ini. Isi furigana secara manual; tidak ada bacaan otomatis yang dibuat."); return; }
    const sameExample = card.example.before + card.example.focus + card.example.after === known.example.before + known.example.focus + known.example.after;
    updateCard({ reading: known.reading, ...(sameExample ? { example: { ...known.example, translation: card.example.translation } } : {}) });
    if (!sameExample) setError("Bacaan kata diisi dari fixture. Contoh kalimat berbeda; isi teks fokus dan bacaannya secara manual.");
  }

  function moveCard(id: string, direction: number) {
    setDraft((current) => {
      if (!current) return current;
      const index = current.cards.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.cards.length) return current;
      const cards = [...current.cards];
      [cards[index], cards[target]] = [cards[target], cards[index]];
      return { ...current, cards };
    });
  }

  function moveDeck(id: string, direction: number) {
    setDecks((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setMessage("Urutan deck diubah untuk sesi ini. Halaman siswa tidak berubah.");
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const invalid = deckError(draft);
    if (invalid) { setError(invalid); return; }
    const maxOrder = decks.length + (decks.some((deck) => deck.id === draft.id) ? 0 : 1);
    const order = Number(draft.order);
    if (!/^\d+$/.test(draft.order) || !Number.isSafeInteger(order) || order < 1 || order > maxOrder) { setError(`Urutan harus berupa angka bulat dari 1 hingga ${maxOrder}.`); return; }
    const next: Deck = { id: draft.id, title: draft.title.trim(), context: draft.context, status: draft.status, cards: draft.cards.map((item) => ({ ...item, term: item.term.trim(), reading: item.reading.trim(), meaning: item.meaning.trim(), example: { ...item.example } })) };
    setDecks((current) => { const reordered = current.filter((deck) => deck.id !== next.id); reordered.splice(order - 1, 0, next); return reordered; });
    closeEditor(); setMessage("Flashcard disimpan untuk sesi ini. Halaman siswa tidak berubah.");
  }

  function publish(deck: Deck) {
    const next: Deck = { ...deck, status: deck.status === "Published" ? "Draft" : "Published" };
    const invalid = deckError(next);
    if (invalid) { setMessage(invalid); return; }
    setDecks((current) => current.map((item) => item.id === next.id ? next : item));
    setMessage("Status deck diubah untuk sesi ini. Halaman siswa tidak berubah.");
  }

  return <AdminShell current="/admin/flashcard"><main className="admin-public-prototype admin-flashcard-prototype">
    <style>{`
      .admin-flashcard-prototype .admin-flashcard-search { position:relative; }
      .admin-flashcard-prototype .admin-flashcard-search input { padding-right:44px; }
      .admin-flashcard-prototype .admin-flashcard-search > span { position:absolute; right:14px; top:50%; transform:translateY(-50%); pointer-events:none; }
      .admin-flashcard-prototype .admin-flashcard-preview .flashcard-inner { transition:transform 600ms cubic-bezier(.65,0,.35,1); }
      .admin-flashcard-prototype .admin-flashcard-preview .flash-face { overflow-wrap:anywhere; }
      .admin-flashcard-prototype .admin-flashcard-preview .flash-back { transform:rotateY(180deg); }
      .admin-flashcard-prototype .admin-flashcard-preview .flash-face[aria-hidden="true"] { pointer-events:none; }
      .admin-flashcard-prototype .admin-flashcard-card-fields { min-width:0; border:0; padding:0; display:grid; gap:16px; }
      .admin-flashcard-prototype .admin-flashcard-card-fields legend { font-weight:700; margin-bottom:16px; }
      .admin-flashcard-prototype .button { min-height:44px; min-width:44px; }
      @media (prefers-reduced-motion:reduce) { .admin-flashcard-prototype .admin-flashcard-preview .flashcard-inner { transition:none; } }
    `}</style>
    <AdminPageHeader title="Flashcard" actions={<button type="button" className="button button-primary" onClick={() => edit({ id: crypto.randomUUID(), title: "", context: "N4", status: "Draft", cards: [] })}>Tambah Flashcard</button>} />
    <p role="status">{message}</p>
    <AdminSection><AdminFilterToolbar>
      <label className="admin-search-box admin-flashcard-search"><input type="search" aria-label="Cari Flashcard" value={search} onChange={(event) => setSearch(event.target.value)} /><span aria-hidden="true"><LuSearch /></span></label>
      <label className="admin-field">Konteks<select value={context} onChange={(event) => setContext(event.target.value)}><option value="">Semua</option>{contexts.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua</option><option>Draft</option><option>Published</option></select></label>
    </AdminFilterToolbar><AdminDataTable caption="Flashcard" rows={visible} rowKey={(deck) => deck.id} columns={[
      { key: "title", header: "Judul", cell: (deck) => deck.title },
      { key: "context", header: "Konteks", cell: (deck) => deck.context },
      { key: "cards", header: "Kartu", cell: (deck) => deck.cards.length },
      { key: "order", header: "Urutan", cell: (deck) => decks.findIndex((item) => item.id === deck.id) + 1 },
      { key: "status", header: "Status", cell: (deck) => <AdminStatusBadge status={deck.status} /> },
    ]} actions={{ cell: (deck) => <div className="admin-page-actions">
      <button type="button" className="button" aria-label={`Lihat ${deck.title}`} onClick={() => setView(copyDeck(deck))}>Lihat</button>
      <button type="button" className="button" aria-label={`Edit ${deck.title}`} onClick={() => edit(deck)}>Edit</button>
      <button type="button" className="button" aria-label={`${deck.status === "Published" ? "Draft" : "Publish"} ${deck.title}`} onClick={() => publish(deck)}>{deck.status === "Published" ? "Draft" : "Publish"}</button>
      <button type="button" className="button" aria-label={`Naik ${deck.title}`} disabled={decks[0]?.id === deck.id} onClick={() => moveDeck(deck.id, -1)}>Naik</button>
      <button type="button" className="button" aria-label={`Turun ${deck.title}`} disabled={decks.at(-1)?.id === deck.id} onClick={() => moveDeck(deck.id, 1)}>Turun</button>
      <button type="button" className="button" aria-label={`Hapus ${deck.title}`} onClick={() => setDeleting(deck)}>Hapus</button>
    </div> }} /></AdminSection>
    <AdminDialog open={Boolean(draft)} title={`${decks.some((deck) => deck.id === draft?.id) ? "Edit" : "Tambah"} Flashcard`} close={closeEditor}>
      {draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
        <label className="admin-field">Judul deck<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="admin-field">Konteks<select value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })}>{contexts.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="admin-field">Urutan deck<input type="number" min="1" step="1" required value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} /></label>
        <label className="admin-field">Status deck<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Deck["status"] })}><option>Draft</option><option>Published</option></select></label>
        <AdminDataTable caption="Kartu dalam deck" rows={draft.cards} rowKey={(item) => item.id} columns={[
          { key: "order", header: "Urutan", cell: (item) => draft.cards.findIndex((value) => value.id === item.id) + 1 },
          { key: "term", header: "Japanese", cell: (item) => <ruby lang="ja">{item.term}<rt>{item.reading}</rt></ruby> },
          { key: "meaning", header: "Arti", cell: (item) => item.meaning },
          { key: "status", header: "Status", cell: (item) => <AdminStatusBadge status={item.status} /> },
        ]} actions={{ cell: (item) => <div className="admin-page-actions">
          <button type="button" className="button" aria-pressed={cardId === item.id} aria-label={`Edit kartu ${item.term || "baru"}`} onClick={() => { setCardId(item.id); setError(""); }}>Edit</button>
          <button type="button" className="button" aria-label={`${item.status === "Published" ? "Draft" : "Publish"} kartu ${item.term}`} onClick={() => { const invalid = item.status === "Draft" ? cardError(item) : ""; if (invalid) { setError(invalid); return; } setDraft({ ...draft, cards: draft.cards.map((value) => value.id === item.id ? { ...value, status: value.status === "Published" ? "Draft" : "Published" } : value) }); }}>{item.status === "Published" ? "Draft" : "Publish"}</button>
          <button type="button" className="button" aria-label={`Naik kartu ${item.term}`} disabled={draft.cards[0]?.id === item.id} onClick={() => moveCard(item.id, -1)}>Naik</button>
          <button type="button" className="button" aria-label={`Turun kartu ${item.term}`} disabled={draft.cards.at(-1)?.id === item.id} onClick={() => moveCard(item.id, 1)}>Turun</button>
          <button type="button" className="button" aria-label={`Hapus kartu ${item.term}`} onClick={() => { if (!window.confirm(`Hapus kartu ${item.term || "baru"} dari draft deck?`)) return; const cards = draft.cards.filter((value) => value.id !== item.id); setDraft({ ...draft, cards }); if (cardId === item.id) setCardId(cards[0]?.id ?? ""); setError(""); }}>Hapus</button>
        </div> }} />
        <button type="button" className="button" onClick={addCard}>Tambah Kartu</button>
        {card && <fieldset className="admin-flashcard-card-fields"><legend>Edit Kartu</legend>
          <label className="admin-field">Japanese<input required lang="ja" value={card.term} onChange={(event) => { updateCard({ term: event.target.value, reading: "" }); }} /></label>
          <label className="admin-field">Bacaan / Furigana<input required lang="ja" value={card.reading} onChange={(event) => updateCard({ reading: event.target.value })} /></label>
          <button type="button" className="button" onClick={generateFurigana}>Generate Furigana</button>
          <p>Furigana otomatis hanya tersedia untuk kata dan contoh kalimat fixture yang dikenal. Bacaan tetap dapat diedit manual.</p>
          <label className="admin-field">Arti<input required value={card.meaning} onChange={(event) => updateCard({ meaning: event.target.value })} /></label>
          <label className="admin-field">Contoh kalimat<textarea lang="ja" required value={card.example.before + card.example.focus + card.example.after} onChange={(event) => updateCard({ example: { before: event.target.value, focus: "", focusReading: "", after: "", translation: card.example.translation } })} /></label>
          <label className="admin-field">Sebelum teks fokus<input lang="ja" value={card.example.before} onChange={(event) => updateCard({ example: { ...card.example, before: event.target.value } })} /></label>
          <label className="admin-field">Teks fokus (opsional)<input lang="ja" value={card.example.focus} onChange={(event) => updateCard({ example: { ...card.example, focus: event.target.value, focusReading: "" } })} /></label>
          <label className="admin-field">Furigana teks fokus (opsional)<input lang="ja" value={card.example.focusReading} onChange={(event) => updateCard({ example: { ...card.example, focusReading: event.target.value } })} /></label>
          <label className="admin-field">Sesudah teks fokus<input lang="ja" value={card.example.after} onChange={(event) => updateCard({ example: { ...card.example, after: event.target.value } })} /></label>
          <label className="admin-field">Terjemahan contoh<textarea required value={card.example.translation} onChange={(event) => updateCard({ example: { ...card.example, translation: event.target.value } })} /></label>
          <label className="admin-field">Urutan kartu<input type="number" min="1" max={draft.cards.length} step="1" value={draft.cards.findIndex((item) => item.id === card.id) + 1} onChange={(event) => { const order = Number(event.target.value); if (!Number.isSafeInteger(order) || order < 1 || order > draft.cards.length) { setError(`Urutan kartu harus dari 1 hingga ${draft.cards.length}.`); return; } const cards = draft.cards.filter((item) => item.id !== card.id); cards.splice(order - 1, 0, card); setDraft({ ...draft, cards }); setError(""); }} /></label>
          <label className="admin-field">Status kartu<select value={card.status} onChange={(event) => updateCard({ status: event.target.value as Card["status"] })}><option>Draft</option><option>Published</option></select></label>
          <FlashcardPreview key={card.id} card={card} />
        </fieldset>}
        {error && <p role="alert">{error}</p>}
        <div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary">Simpan Flashcard</button></div>
      </form>}
    </AdminDialog>
    <AdminDialog open={Boolean(view)} title="Detail Flashcard" close={closeView}>{view && <DeckPreview key={view.id} deck={view} />}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Flashcard?" close={closeDelete} actions={<><button type="button" className="button" onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" onClick={() => { setDecks((current) => current.filter((deck) => deck.id !== deleting?.id)); closeDelete(); setMessage("Flashcard dihapus dari sesi ini. Halaman siswa tidak berubah."); }}>Hapus Flashcard</button></>}><p>Hapus {deleting?.title} beserta kartunya dari sesi ini? Halaman siswa tidak berubah.</p></AdminDialog>
  </main></AdminShell>;
}
