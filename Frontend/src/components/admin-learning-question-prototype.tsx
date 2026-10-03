"use client";

import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { LuSearch } from "react-icons/lu";
import { AdminDataTable, AdminDialog, AdminFilterToolbar, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import { AdminLearningQuestionPreview, type AdminLearningQuestion } from "@/components/admin-learning-question-preview";

const contexts = ["N5", "N4", "N3", "N2", "N1"] as const;
const letters = ["A", "B", "C", "D"] as const;
type Group = { title: string; passage: string };
type Kind = "Audio" | "Reading";
const family = {
  Audio: { route: "/admin/audio", title: "Audio", groupLabel: "Judul grup", initialGroup: { title: "Percakapan tentang rutinitas pagi", passage: "" } },
  Reading: { route: "/admin/reading", title: "Reading", groupLabel: "Teks bacaan", initialGroup: { title: "", passage: "毎朝、田中さんは七時に起きます。朝ご飯を食べてから、日本語を三十分勉強します。そのあと、八時に会社へ行きます。" } },
} satisfies Record<Kind, { route: string; title: string; groupLabel: string; initialGroup: Group }>;

type Fixture = { id: string; prompt: string; instruction?: string; answers: string[]; correctAnswer: number };
const audioQuestions: Fixture[] = [
  { id: "audio-1", prompt: "Apa aktivitas yang dilakukan pembicara setiap pagi?", instruction: "Dengarkan audio sampai selesai sebelum memilih jawaban.", answers: ["Membaca koran", "Belajar Bahasa Jepang", "Berangkat ke stasiun", "Memasak sarapan"], correctAnswer: 1 },
  { id: "audio-2", prompt: "Pukul berapa pembicara mulai belajar?", answers: ["Pukul enam", "Pukul tujuh", "Pukul delapan", "Pukul sembilan"], correctAnswer: 1 },
  { id: "audio-3", prompt: "Berapa lama pembicara belajar bahasa Jepang?", answers: ["Lima belas menit", "Tiga puluh menit", "Satu jam", "Dua jam"], correctAnswer: 1 },
  { id: "audio-4", prompt: "Apa yang dilakukan setelah belajar?", answers: ["Pergi ke perusahaan", "Tidur kembali", "Membaca koran", "Memasak"], correctAnswer: 0 },
  { id: "audio-5", prompt: "Topik utama percakapan adalah...", answers: ["Rencana liburan", "Rutinitas pagi", "Belanja mingguan", "Hobi akhir pekan"], correctAnswer: 1 },
];
const readingQuestions: Fixture[] = [
  { id: "reading-1", prompt: "Apa yang dilakukan Tanaka setelah sarapan?", answers: ["Pergi ke perusahaan", "Belajar Bahasa Jepang", "Tidur kembali", "Membaca buku"], correctAnswer: 1 },
  { id: "reading-2", prompt: "Pukul berapa Tanaka bangun?", answers: ["Pukul enam", "Pukul tujuh", "Pukul delapan", "Pukul sembilan"], correctAnswer: 1 },
  { id: "reading-3", prompt: "Berapa lama Tanaka belajar?", answers: ["Sepuluh menit", "Dua puluh menit", "Tiga puluh menit", "Satu jam"], correctAnswer: 2 },
  { id: "reading-4", prompt: "Ke mana Tanaka pergi setelah belajar?", answers: ["Sekolah", "Stasiun", "Perusahaan", "Perpustakaan"], correctAnswer: 2 },
  { id: "reading-5", prompt: "Urutan kegiatan Tanaka yang benar adalah...", answers: ["Belajar, bangun, sarapan", "Bangun, sarapan, belajar", "Sarapan, bekerja, bangun", "Bekerja, belajar, sarapan"], correctAnswer: 1 },
];

function groupKey(context: string, chapter: string) { return JSON.stringify([context, chapter.trim()]); }
function sameGroup(a: AdminLearningQuestion, b: AdminLearningQuestion) { return groupKey(a.context, a.chapter) === groupKey(b.context, b.chapter); }
function sorted(rows: AdminLearningQuestion[]) { return [...rows].sort((a, b) => Number(a.order) - Number(b.order) || a.id.localeCompare(b.id)); }
function validAudio(file: File | null) { return !file || Boolean(file.name.trim() && file.size > 0 && file.type.startsWith("audio/")); }
function questionError(item: AdminLearningQuestion) {
  if (!contexts.some((context) => context === item.context) || !item.chapter.trim()) return "Pilih konteks JLPT dan isi chapter.";
  if (!item.prompt.trim() || item.answers.length !== 4 || item.answers.some((answer) => !answer.trim())) return "Isi pertanyaan dan pilihan A–D.";
  if (!Number.isInteger(item.correctAnswer) || item.correctAnswer < 0 || item.correctAnswer > 3) return "Pilih jawaban benar A–D.";
  if (!/^\d+$/.test(item.order) || !Number.isSafeInteger(Number(item.order)) || Number(item.order) < 1) return "Urutan harus berupa bilangan bulat positif.";
  if (!["Draft", "Published"].includes(item.status)) return "Pilih status yang valid.";
  if (!validAudio(item.file)) return "Pilih file audio yang valid dan tidak kosong.";
  return "";
}

function AudioBuilder({ draft, update, error }: { draft: AdminLearningQuestion; update: (item: AdminLearningQuestion) => void; error: (message: string) => void }) {
  return <><label className="admin-field">File audio (opsional)<input type="file" accept="audio/*" onChange={(event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!validAudio(file)) { error("Pilih file audio yang valid dan tidak kosong."); return; }
    error(""); update({ ...draft, file });
  }} /></label>{draft.file ? <div className="admin-learning-media-file"><span>{draft.file.name} • {draft.file.size.toLocaleString("id-ID")} byte</span><button className="button" type="button" onClick={() => update({ ...draft, file: null })}>Hapus file</button></div> : <p>OPEN: file audio lokal belum tersedia.</p>}</>;
}

function ReadingBuilder({ group, update }: { group: Group; update: (group: Group) => void }) {
  return <label className="admin-field">Teks bacaan<textarea lang="ja" required value={group.passage} onChange={(event) => update({ ...group, passage: event.target.value })} /></label>;
}

function QuestionWorkspace({ kind }: { kind: Kind }) {
  const config = family[kind];
  const [rows, setRows] = useState<AdminLearningQuestion[]>(() => (kind === "Audio" ? audioQuestions : readingQuestions).map((item, index) => ({ ...item, answers: [...item.answers], instruction: item.instruction ?? "", context: "N4", chapter: "Chapter 1", explanation: "", order: String(index + 1), status: "Published", file: null })));
  const [groups, setGroups] = useState<Record<string, Group>>(() => ({ [groupKey("N4", "Chapter 1")]: { ...config.initialGroup } }));
  const [draft, setDraft] = useState<AdminLearningQuestion | null>(null);
  const [groupDraft, setGroupDraft] = useState<{ context: string; chapter: string; group: Group } | null>(null);
  const [view, setView] = useState<AdminLearningQuestion | null>(null);
  const [deleting, setDeleting] = useState<AdminLearningQuestion | null>(null);
  const [search, setSearch] = useState("");
  const [context, setContext] = useState("");
  const [chapter, setChapter] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeGroup = useCallback(() => { setGroupDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const groupFor = (item: { context: string; chapter: string }) => groups[groupKey(item.context, item.chapter)] ?? { title: "", passage: "" };
  const query = search.trim().toLowerCase();
  const visible = sorted(rows.filter((row) => (!context || row.context === context) && (!chapter || row.chapter === chapter) && (!status || row.status === status) && [row.prompt, row.chapter, row.context, row.instruction, ...row.answers, groupFor(row).title, groupFor(row).passage].some((value) => value.toLowerCase().includes(query))));
  const chapters = [...new Set(rows.filter((row) => !context || row.context === context).map((row) => row.chapter))];
  function edit(item: AdminLearningQuestion) { setError(""); setDraft({ ...item, answers: [...item.answers] }); }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const issue = questionError(draft) || (kind === "Reading" && !groupFor(draft).passage.trim() ? "Isi teks bacaan chapter sebelum menyimpan soal." : "");
    if (issue) { setError(issue); return; }
    const next = { ...draft, chapter: draft.chapter.trim(), prompt: draft.prompt.trim(), instruction: draft.instruction.trim(), answers: draft.answers.map((answer) => answer.trim()), explanation: draft.explanation.trim() };
    setRows((current) => current.some((row) => row.id === next.id) ? current.map((row) => row.id === next.id ? next : row) : [...current, next]);
    closeEditor(); setMessage(`${kind} disimpan untuk sesi ini. Halaman siswa tidak berubah.`);
  }
  function move(item: AdminLearningQuestion, direction: -1 | 1) {
    setRows((current) => {
      const siblings = sorted(current.filter((row) => sameGroup(row, item)));
      const index = siblings.findIndex((row) => row.id === item.id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= siblings.length) return current;
      [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
      const orders = new Map(siblings.map((row, rowIndex) => [row.id, String(rowIndex + 1)]));
      return current.map((row) => orders.has(row.id) ? { ...row, order: orders.get(row.id)! } : row);
    });
    setMessage("Urutan diubah untuk sesi ini.");
  }
  function preview(item: AdminLearningQuestion, group = groupFor(item), unsaved = false): ReactNode {
    const items = sorted(rows.filter((row) => sameGroup(row, item) && row.id !== item.id).concat(item));
    return <AdminLearningQuestionPreview key={`${unsaved ? "draft" : "view"}-${item.id}`} kind={kind} questions={items} title={group.title} passage={group.passage} initialQuestionId={item.id} />;
  }
  return <AdminShell current={config.route}><main className="admin-public-prototype admin-learning-question-prototype">
    <AdminPageHeader title={config.title} actions={<button className="button button-primary" type="button" onClick={() => edit({ id: crypto.randomUUID(), context: context || "N4", chapter: chapter || "Chapter 1", prompt: "", instruction: "", answers: ["", "", "", ""], correctAnswer: -1, explanation: "", order: String(rows.filter((row) => row.context === (context || "N4") && row.chapter === (chapter || "Chapter 1")).reduce((max, row) => Math.max(max, Number(row.order)), 0) + 1), status: "Draft", file: null })}>Tambah {kind}</button>} />
    <p role="status">{message}</p>
    <AdminSection><AdminFilterToolbar>
      <label className="admin-search-box admin-learning-media-search admin-learning-question-search"><input type="search" aria-label={`Cari ${kind}`} value={search} onChange={(event) => setSearch(event.target.value)} /><span aria-hidden="true"><LuSearch /></span></label>
      <label className="admin-field">Konteks<select value={context} onChange={(event) => { setContext(event.target.value); setChapter(""); }}><option value="">Semua</option>{contexts.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">Chapter<select value={chapter} onChange={(event) => setChapter(event.target.value)}><option value="">Semua</option>{chapters.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="admin-field">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua</option><option>Draft</option><option>Published</option></select></label>
    </AdminFilterToolbar><AdminDataTable caption={kind} rows={visible} rowKey={(row) => row.id} columns={[
      { key: "prompt", header: "Pertanyaan", cell: (row) => row.prompt },
      { key: "context", header: "Konteks", cell: (row) => `${row.context} • ${row.chapter}` },
      { key: "answer", header: "Jawaban benar", cell: (row) => letters[row.correctAnswer] },
      { key: "order", header: "Urutan", cell: (row) => row.order },
      { key: "status", header: "Status", cell: (row) => <AdminStatusBadge status={row.status} /> },
    ]} actions={{ cell: (row) => {
      const siblings = sorted(rows.filter((item) => sameGroup(row, item)));
      const index = siblings.findIndex((item) => item.id === row.id);
      return <div className="admin-page-actions">
        <button className="button" type="button" aria-label={`Lihat ${row.prompt}`} onClick={() => setView({ ...row, answers: [...row.answers] })}>Lihat</button>
        <button className="button" type="button" aria-label={`Edit ${row.prompt}`} onClick={() => edit(row)}>Edit</button>
        <button className="button" type="button" aria-label={`Edit ${config.groupLabel} ${row.context} ${row.chapter}`} onClick={() => { setError(""); setGroupDraft({ context: row.context, chapter: row.chapter, group: { ...groupFor(row) } }); }}>Edit {config.groupLabel}</button>
        <button className="button" type="button" aria-label={`${row.status === "Draft" ? "Publish" : "Draft"} ${row.prompt}`} onClick={() => {
          const issue = questionError(row) || (kind === "Reading" && !groupFor(row).passage.trim() ? "Isi teks bacaan chapter sebelum publish." : "");
          if (issue) { setMessage(issue); return; }
          setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: item.status === "Draft" ? "Published" : "Draft" } : item)); setMessage("Status diubah untuk sesi ini. Halaman siswa tidak berubah.");
        }}>{row.status === "Draft" ? "Publish" : "Draft"}</button>
        <button className="button" type="button" aria-label={`Naik ${row.prompt}`} disabled={index === 0} onClick={() => move(row, -1)}>Naik</button>
        <button className="button" type="button" aria-label={`Turun ${row.prompt}`} disabled={index === siblings.length - 1} onClick={() => move(row, 1)}>Turun</button>
        <button className="button" type="button" aria-label={`Hapus ${row.prompt}`} onClick={() => setDeleting(row)}>Hapus</button>
      </div>;
    } }} /></AdminSection>
    <AdminDialog open={Boolean(draft) && !groupDraft} title={`${rows.some((row) => row.id === draft?.id) ? "Edit" : "Tambah"} ${kind}`} close={closeEditor}>
      {draft && <form className="admin-prototype-form" onSubmit={save} noValidate>
        <label className="admin-field">Konteks<select value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })}>{contexts.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="admin-field">Chapter<input required value={draft.chapter} onChange={(event) => setDraft({ ...draft, chapter: event.target.value })} /></label>
        {kind === "Audio" ? <AudioBuilder draft={draft} update={setDraft} error={setError} /> : <p>Teks bacaan dibagikan oleh semua soal pada chapter ini.</p>}
        <button className="button" type="button" disabled={!draft.chapter.trim()} onClick={() => { setError(""); setGroupDraft({ context: draft.context, chapter: draft.chapter.trim(), group: { ...groupFor(draft) } }); }}>Edit {config.groupLabel}</button>
        <label className="admin-field">Pertanyaan<textarea required value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} /></label>
        <label className="admin-field">Instruksi (opsional)<textarea value={draft.instruction} onChange={(event) => setDraft({ ...draft, instruction: event.target.value })} /></label>
        {letters.map((letter, index) => <label className="admin-field" key={letter}>Pilihan {letter}<input required value={draft.answers[index]} onChange={(event) => setDraft({ ...draft, answers: draft.answers.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer) })} /></label>)}
        <label className="admin-field">Jawaban benar<select value={draft.correctAnswer} onChange={(event) => setDraft({ ...draft, correctAnswer: Number(event.target.value) })}><option value={-1}>Pilih jawaban</option>{letters.map((letter, index) => <option key={letter} value={index}>{letter}</option>)}</select></label>
        <label className="admin-field">Penjelasan (opsional)<textarea value={draft.explanation} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} /></label>
        <label className="admin-field">Urutan<input type="number" min="1" step="1" required value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} /></label>
        <label className="admin-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminLearningQuestion["status"] })}><option>Draft</option><option>Published</option></select></label>
        {preview(draft, groupFor(draft), true)}
        {error && <p role="alert">{error}</p>}
        <div className="admin-page-actions"><button className="button" type="button" onClick={closeEditor}>Batal</button><button className="button button-primary" type="submit">Simpan {kind}</button></div>
      </form>}
    </AdminDialog>
    <AdminDialog open={Boolean(groupDraft)} title={`Edit ${config.groupLabel}`} close={closeGroup}>{groupDraft && <form className="admin-prototype-form" noValidate onSubmit={(event) => {
      event.preventDefault();
      if (!contexts.some((value) => value === groupDraft.context) || !groupDraft.chapter.trim() || (kind === "Reading" ? !groupDraft.group.passage.trim() : !groupDraft.group.title.trim())) { setError(`Isi ${config.groupLabel}.`); return; }
      setGroups((current) => ({ ...current, [groupKey(groupDraft.context, groupDraft.chapter)]: { ...groupDraft.group } })); closeGroup(); setMessage(`${config.groupLabel} disimpan untuk seluruh soal chapter pada sesi ini.`);
    }}><p>{groupDraft.context} • {groupDraft.chapter}</p>{kind === "Reading" ? <ReadingBuilder group={groupDraft.group} update={(group) => setGroupDraft({ ...groupDraft, group })} /> : <label className="admin-field">Judul grup<input required value={groupDraft.group.title} onChange={(event) => setGroupDraft({ ...groupDraft, group: { ...groupDraft.group, title: event.target.value } })} /></label>}
      <AdminLearningQuestionPreview kind={kind} questions={sorted(rows.filter((row) => groupKey(row.context, row.chapter) === groupKey(groupDraft.context, groupDraft.chapter)).filter((row) => row.id !== draft?.id).concat(draft && groupKey(draft.context, draft.chapter) === groupKey(groupDraft.context, groupDraft.chapter) ? [draft] : []))} passage={groupDraft.group.passage} title={groupDraft.group.title} />
      {error && <p role="alert">{error}</p>}<div className="admin-page-actions"><button className="button" type="button" onClick={closeGroup}>Batal</button><button className="button button-primary" type="submit">Simpan</button></div>
    </form>}</AdminDialog>
    <AdminDialog open={Boolean(view)} title={`Detail ${kind}`} close={closeView}>{view && preview(view)}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title={`Hapus ${kind}?`} close={closeDelete} actions={<><button className="button" type="button" onClick={closeDelete}>Batal</button><button className="button button-primary" type="button" onClick={() => { setRows((current) => current.filter((row) => row.id !== deleting?.id)); closeDelete(); setMessage(`${kind} dihapus dari sesi ini.`); }}>Hapus {kind}</button></>}><p>Hapus {deleting?.prompt} dari sesi ini? Halaman siswa tidak berubah.</p></AdminDialog>
  </main></AdminShell>;
}

export function AdminAudioPrototype() { return <QuestionWorkspace kind="Audio" />; }
export function AdminReadingPrototype() { return <QuestionWorkspace kind="Reading" />; }
