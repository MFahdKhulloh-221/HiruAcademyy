"use client";

import Image from "next/image";
import { PlacementRichText, PlacementTextEditor } from "@/components/placement-rich-text";
import { placementText } from "@/lib/placement-rich-text";
import { LuCircleCheck, LuSettings, LuTriangleAlert } from "react-icons/lu";
import { type FormEvent, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { AdminDialog, AdminEmptyState, AdminPageHeader, AdminShell, AdminStatusBadge } from "@/components/admin-primitives";
import type { PlacementQuestion, PlacementSettings } from "@/components/admin-placement-preview";
import { useLearningRequest } from "@/components/learning-hooks";
import { loadAdminPlacement, saveAdminPlacement, saveAdminPlacementQuestion, placementQuestionView, deleteAdminPlacementQuestion } from "@/lib/admin-placement-api";
import { adminMediaUrl } from "@/lib/admin-media";
import styles from "./admin-placement-builder.module.css";

const letters = ["A", "B", "C", "D"] as const;
const categories = ["Bunpou", "Moji・Goi", "Dokkai", "Choukai"] as const;
const levels = ["N5", "N4", "N3", "N2", "N1"] as const;
const mediaTypes = ["Teks", "Gambar", "Audio", "Reading"] as const;
type MediaType = typeof mediaTypes[number];
type QuestionDraft = PlacementQuestion & { mediaType: MediaType; order: number };

function mediaType(question: PlacementQuestion): MediaType {
  return question.imageUrl ? "Gambar" : question.audioUrl ? "Audio" : question.passage ? "Reading" : "Teks";
}

function questionError(question: PlacementQuestion, kind = mediaType(question)) {
  if (!placementText(question.prompt).trim()) return "Pertanyaan wajib diisi.";
  if (!levels.some(level => level === question.level)) return "Pilih level N5–N1.";
  if (!categories.some(category => category === question.category)) return "Pilih kategori yang tersedia.";
  if (question.answers.length !== 4 || question.answers.some(answer => !placementText(answer).trim())) return "Isi semua pilihan jawaban A–D.";
  if (!letters.some(letter => letter === question.correct)) return "Pilih jawaban benar.";
  if (kind === "Gambar" && !question.imageUrl?.trim()) return "Upload atau pilih gambar terlebih dahulu.";
  if (kind === "Audio" && !question.audioUrl?.trim()) return "Upload atau pilih audio terlebih dahulu.";
  if (kind === "Reading" && !placementText(question.passage ?? "").trim()) return "Isi teks bacaan.";
  if (question.published && question.category === "Choukai" && !question.audioUrl?.trim()) return "Soal Choukai Published memerlukan jenis Audio.";
  if (question.published && question.category === "Dokkai" && !placementText(question.passage ?? "").trim()) return "Soal Dokkai Published memerlukan jenis Reading.";
  return "";
}

export function AdminPlacementPrototype() {
  const request = useLearningRequest(loadAdminPlacement, "admin-placement");
  if (request.error) return <AdminShell current="/admin/placement-hasil"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></AdminShell>;
  if (!request.data) return <AdminShell current="/admin/placement-hasil"><LoadingSkeleton variant="list" /></AdminShell>;
  return <PlacementEditor initial={request.data} />;
}

function PlacementEditor({ initial }: { initial: Awaited<ReturnType<typeof loadAdminPlacement>> }) {
  const [configId, setConfigId] = useState(initial.config?.id);
  const [settings, setSettings] = useState(initial.settings);
  const [settingsDraft, setSettingsDraft] = useState<PlacementSettings | null>(null);
  const [rows, setRows] = useState(initial.questions.map(placementQuestionView));
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [deleting, setDeleting] = useState<PlacementQuestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const ready = rows.filter(row => row.published && !questionError(row)).length;

  function close() {
    if (busy) return;
    setDraft(null); setSettingsDraft(null); setDeleting(null); setError("");
  }

  async function saveSettings(publish: boolean) {
    if (!settingsDraft || busy) return;
    if (!settingsDraft.title.trim() || !settingsDraft.description.trim()) { setError("Judul dan deskripsi wajib diisi."); return; }
    const minutes = Number(settingsDraft.minutes);
    if (!/^\d+$/.test(settingsDraft.minutes) || !Number.isSafeInteger(minutes) || minutes < 1 || minutes > 2147483647) { setError("Durasi total harus berupa menit bulat positif."); return; }
    setBusy(true); setError("");
    try {
      const next = { ...settingsDraft, title: settingsDraft.title.trim(), description: settingsDraft.description.trim(), introHeading: settingsDraft.introHeading.trim() || settingsDraft.title.trim() };
      const saved = await saveAdminPlacement(next, configId, publish);
      setConfigId(saved.id); setSettings(next); setSettingsDraft(null);
      setMessage(publish ? "Placement Test diterbitkan." : "Pengaturan disimpan sebagai Draft.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Pengaturan gagal disimpan."); }
    finally { setBusy(false); }
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !configId || busy) return;
    const invalid = questionError(draft, draft.mediaType);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError("");
    try {
      await saveAdminPlacementQuestion(draft, configId, draft.order);
      const fresh = await loadAdminPlacement();
      setRows(fresh.questions.map(placementQuestionView)); setDraft(null); setMessage("Soal disimpan.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Soal gagal disimpan. Muat ulang sebelum mencoba lagi jika koneksi terputus."); }
    finally { setBusy(false); }
  }

  function addQuestion() {
    setError(""); setMessage("");
    if (!configId) { setSettingsDraft(settings); setError("Simpan pengaturan tes terlebih dahulu, lalu tambah soal."); return; }
    setDraft({ id: crypto.randomUUID(), prompt: "", answers: ["", "", "", ""], correct: "", category: "Bunpou", level: "N5", published: false, passage: null, explanation: "", imageUrl: "", audioUrl: "", mediaType: "Teks", order: Math.max(0, ...initial.questions.map(q => q.sort_order), rows.length) + 1 });
  }

  const image = adminMediaUrl(draft?.imageUrl);
  const audio = adminMediaUrl(draft?.audioUrl);

  return <AdminShell current="/admin/placement-hasil"><main className={styles.builder}>
    <AdminPageHeader title="Placement Test" actions={<button type="button" className="button button-primary" onClick={() => { setError(""); setSettingsDraft({ ...settings }); }}><LuSettings aria-hidden="true" />Pengaturan Tes</button>} />
    {message && <p role="status">{message}</p>}
    <div className={styles.readinessRow}><section className={`${styles.summary} ${ready < 15 ? styles.warning : styles.ready}`} role="note" aria-label="Informasi kesiapan tes">{ready < 15 ? <LuTriangleAlert aria-hidden="true" /> : <LuCircleCheck aria-hidden="true" />}<p>{ready < 15 ? `Agar tes dapat tampil di halaman Placement Test, buat minimal 15 soal siap pakai. Saat ini ${ready} soal siap; tambahkan ${15 - ready} soal lagi.` : `${ready} soal siap. Semua soal aktif digunakan pada tes baru.`}</p></section>
    <div className={styles.readinessActions}><button type="button" className="button button-primary" onClick={addQuestion}>+ Tambah Soal</button></div></div>
    {!rows.length ? <AdminEmptyState title="Belum ada soal" description="Tambahkan soal pertama untuk memulai." /> : <ol className={styles.list} aria-label="Daftar soal Placement Test">{rows.map((row, index) => <li key={row.id} className={styles.card}>
      <div className={styles.content}><div className={styles.meta}><strong>Soal {index + 1}</strong><span>{row.level ?? "Level belum diisi"}</span><span>{row.category}</span><AdminStatusBadge status={row.published ? "Published" : "Draft"} /></div><p className={styles.prompt}><PlacementRichText value={row.prompt} /></p>{questionError(row) && <small>Belum siap: {questionError(row)}</small>}</div>
      <div className={styles.actions}><button type="button" className="button button-secondary" aria-label={`Edit soal ${index + 1}`} onClick={() => { setError(""); setDraft({ ...row, answers: [...row.answers], mediaType: mediaType(row), order: initial.questions.find(q => String(q.id) === row.id)?.sort_order ?? index + 1 }); }}>Edit</button><button type="button" className="button button-secondary" aria-label={`Hapus soal ${index + 1}`} onClick={() => { setError(""); setDeleting(row); }}>Hapus</button></div>
    </li>)}</ol>}

    <AdminDialog open={Boolean(draft)} title={rows.some(row => row.id === draft?.id) ? "Edit Soal" : "Tambah Soal"} close={close}>
      {draft && <form className={`admin-prototype-form ${styles.form} ${styles.questionForm}`} onSubmit={saveQuestion}>
        <fieldset disabled={busy} className={styles.fields}>
          <div className={styles.questionMeta}>
            <label className="admin-field">Level<select value={draft.level ?? ""} onChange={event => setDraft({ ...draft, level: levels.find(level => level === event.target.value) ?? null })} required><option value="">Pilih level</option>{levels.map(level => <option key={level}>{level}</option>)}</select></label>
            <label className="admin-field">Kategori<select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
            <label className="admin-field">Jenis soal<select value={draft.mediaType} onChange={event => setDraft({ ...draft, mediaType: event.target.value as MediaType, image: undefined, audio: undefined, imageUrl: "", audioUrl: "", passage: null })}>{mediaTypes.map(kind => <option key={kind}>{kind}</option>)}</select></label>
          </div>
          {(draft.mediaType === "Gambar" || draft.mediaType === "Audio") && <div className={styles.media}>
            <AdminMediaUpload key={`${draft.id}-${draft.mediaType}`} kind={draft.mediaType === "Gambar" ? "image" : "audio"} label={draft.mediaType === "Gambar" ? "Upload gambar" : "Upload audio"} onUploaded={path => setDraft(current => current && ({ ...current, ...(current.mediaType === "Gambar" ? { imageUrl: path } : { audioUrl: path }) }))} />
            {draft.mediaType === "Gambar" && image && <Image unoptimized src={image} alt="Pratinjau gambar soal" width={640} height={360} className={styles.image} />}
            {draft.mediaType === "Audio" && audio && <audio controls preload="metadata" src={audio} aria-label="Pratinjau audio soal" />}
          </div>}
          {draft.mediaType === "Reading" && <div className="admin-field"><span>Teks bacaan</span><PlacementTextEditor label="Teks bacaan" value={draft.passage ?? ""} onChange={value => setDraft({ ...draft, passage: value })} /></div>}
          <div className="admin-field"><span>Pertanyaan</span><PlacementTextEditor label="Pertanyaan" value={draft.prompt} onChange={value => setDraft({ ...draft, prompt: value })} /></div>
          <div className={styles.grid}>{letters.map((letter, index) => <div key={letter} className="admin-field"><span>Pilihan {letter}</span><PlacementTextEditor label={`Pilihan ${letter}`} value={draft.answers[index]} onChange={value => setDraft({ ...draft, answers: draft.answers.map((answer, i) => i === index ? value : answer) })} /></div>)}</div>
          <label className="admin-field">Jawaban benar<select value={draft.correct} onChange={event => setDraft({ ...draft, correct: event.target.value })} required><option value="">Pilih jawaban</option>{letters.map(letter => <option key={letter}>{letter}</option>)}</select></label>
          <div className="admin-field"><span>Penjelasan jawaban (opsional)</span><PlacementTextEditor label="Penjelasan jawaban" value={draft.explanation} onChange={value => setDraft({ ...draft, explanation: value })} /></div>
          <label className="admin-field">Status<select value={draft.published ? "published" : "draft"} onChange={event => setDraft({ ...draft, published: event.target.value === "published" })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className={styles.actions}><button type="button" className="button button-secondary" disabled={busy} onClick={close}>Batal</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button></div>
      </form>}
    </AdminDialog>

    <AdminDialog open={Boolean(settingsDraft)} title="Pengaturan Tes" close={close}>
      {settingsDraft && <form className={`admin-prototype-form ${styles.form}`} onSubmit={event => { event.preventDefault(); void saveSettings(false); }}>
        <fieldset disabled={busy} className={styles.fields}>
          <label className="admin-field">Judul<input value={settingsDraft.title} maxLength={255} onChange={event => setSettingsDraft({ ...settingsDraft, title: event.target.value })} required /></label>
          <label className="admin-field">Deskripsi<textarea rows={3} value={settingsDraft.description} onChange={event => setSettingsDraft({ ...settingsDraft, description: event.target.value })} required /></label>
          <label className="admin-field">Durasi total (menit)<input type="number" min="1" max="2147483647" step="1" value={settingsDraft.minutes} onChange={event => setSettingsDraft({ ...settingsDraft, minutes: event.target.value })} required /><small>Durasi keseluruhan tes, bukan per soal.</small></label>
          <label className="admin-field">Jumlah soal aktif (otomatis)<input readOnly value={ready} /></label>
          <p>Minimal 15 soal valid untuk menerbitkan tes.</p>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className={styles.actions}><button type="submit" className="button button-secondary" disabled={busy}>Simpan</button><button type="button" className="button button-primary" disabled={busy || ready < 15} onClick={() => void saveSettings(true)}>Terbitkan</button></div>
      </form>}
    </AdminDialog>

    <AdminDialog open={Boolean(deleting)} title="Hapus Soal?" close={close}>
      <div className={styles.deleteConfirmation}><p className={styles.prompt}><PlacementRichText value={deleting?.prompt ?? ""} /></p><p>Soal dihapus dari bank. Snapshot dan histori attempt tetap tersimpan.</p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" className="button button-secondary" disabled={busy} onClick={close}>Batal</button><button type="button" className="button button-primary" disabled={busy} onClick={async () => {
        if (!deleting || busy) return;
        setBusy(true); setError("");
        try { await deleteAdminPlacementQuestion(deleting.id); setRows(current => current.filter(row => row.id !== deleting.id)); setDeleting(null); setMessage("Soal dihapus dari bank."); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Soal gagal dihapus."); }
        finally { setBusy(false); }
      }}>{busy ? "Menghapus…" : "Hapus Soal"}</button></div></div>
    </AdminDialog>
  </main></AdminShell>;
}
