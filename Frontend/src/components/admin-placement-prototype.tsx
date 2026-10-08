"use client";

import { type FormEvent, useCallback, useState } from "react";
import { AdminMediaUpload } from "@/components/admin-media-upload";
import { AdminDataTable, AdminDialog, AdminEmptyState, AdminPageHeader, AdminSection, AdminShell, AdminStatusBadge, AdminTabs } from "@/components/admin-primitives";
import { AdminPlacementPreview, PlacementMedia, type PlacementQuestion, type PlacementSettings } from "@/components/admin-placement-preview";
import { useLearningRequest } from "@/components/learning-hooks";
import { loadAdminPlacement, saveAdminPlacement, saveAdminPlacementQuestion, placementQuestionView, deleteAdminPlacementQuestion, loadAdminPlacementLeads, updateAdminPlacementLead, type RecommendationRule, type PlacementLead } from "@/lib/admin-placement-api";

const letters = ["A", "B", "C", "D"] as const;
const categories = ["Bunpou", "Moji・Goi", "Dokkai", "Choukai"];
const jlptLevels = ["N5", "N4", "N3", "N2", "N1"] as const;
const placementTabs = ["Soal", "Aturan Hasil", "Leads"] as const;

type QuestionDraft = PlacementQuestion & { order: string };
const initialSettings: PlacementSettings = {
  title: "",
  introHeading: "",
  minutes: "",
  description: "",
};

function questionError(question: PlacementQuestion) {
  if (!question.prompt.trim()) return "Pertanyaan wajib diisi.";
  if (question.answers.length !== 4 || question.answers.some((answer) => !answer.trim())) return "Isi semua pilihan jawaban A, B, C, dan D.";
  if (!letters.some((letter) => letter === question.correct)) return "Pilih satu jawaban benar: A, B, C, atau D.";
  if (!categories.some((category) => category === question.category)) return "Pilih kategori pertanyaan yang tersedia.";
  if (question.image && !question.image.type.startsWith("image/")) return "Pilih file gambar dengan MIME image/*.";
  if (question.audio && !question.audio.type.startsWith("audio/")) return "Pilih file audio dengan MIME audio/*.";
  return "";
}

function settingsError(settings: PlacementSettings) {
  if (!settings.title.trim()) return "Judul Placement Test wajib diisi.";
  if (!settings.introHeading.trim()) return "Intro Heading wajib diisi.";
  if (!settings.description.trim()) return "Deskripsi Tes wajib diisi.";
  const minutes = Number(settings.minutes);
  if (!/^\d+$/.test(settings.minutes) || !Number.isSafeInteger(minutes) || minutes < 1) return "Waktu pengerjaan harus berupa angka bulat positif dalam menit.";
  return "";
}

export function AdminPlacementPrototype() {
  const request = useLearningRequest(loadAdminPlacement, "admin-placement");
  if (request.error) return <AdminShell current="/admin/placement-hasil"><p role="alert">{request.error}</p><button type="button" onClick={request.retry}>Coba Lagi</button></AdminShell>;
  if (!request.data) return <AdminShell current="/admin/placement-hasil"><p role="status">Memuat…</p></AdminShell>;
  return <PlacementEditor initial={request.data} />;
}

function PlacementEditor({ initial }: { initial: Awaited<ReturnType<typeof loadAdminPlacement>> }) {
  const [activeTab, setActiveTab] = useState<string>("Soal");
  const [configId, setConfigId] = useState(initial.config?.id);
  const [settings, setSettings] = useState(initial.settings ?? initialSettings);
  const [rows, setRows] = useState<PlacementQuestion[]>(initial.questions.map(placementQuestionView));
  const [rules, setRules] = useState<RecommendationRule[]>(initial.rules ?? []);
  const [ruleDraft, setRuleDraft] = useState<RecommendationRule | null>(null);
  const [leads, setLeads] = useState<PlacementLead[]>([]);
  const [leadsLoaded, setLeadsLoaded] = useState(false);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [view, setView] = useState<PlacementQuestion | null>(null);
  const [deleting, setDeleting] = useState<PlacementQuestion | null>(null);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState(initial.config?.status === "published" ? "Published" : "Draft");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [message, setMessage] = useState("");

  const closeEditor = useCallback(() => { setDraft(null); setError(""); }, []);
  const closeView = useCallback(() => setView(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const closePreview = useCallback(() => setPreview(false), []);
  const closeRuleDraft = useCallback(() => { setRuleDraft(null); setError(""); }, []);

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    setPageError("");
    setMessage("");
    if (tab === "Leads" && !leadsLoaded) {
      setLeadsLoading(true);
      loadAdminPlacementLeads()
        .then((data) => { setLeads(data); setLeadsLoaded(true); })
        .catch((cause) => setPageError(cause instanceof Error ? cause.message : "Gagal memuat data leads."))
        .finally(() => setLeadsLoading(false));
    }
  }

  function updateSettings(patch: Partial<PlacementSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    setPageError(""); setStatus("Draft"); setMessage("");
  }

  async function saveConfiguration(publish: boolean) {
    const invalid = settingsError(settings) || (publish && !rows.some((row) => row.published) ? "Assessment membutuhkan minimal satu pertanyaan." : "") || (publish ? rows.filter((row) => row.published).map(questionError).find(Boolean) : "");
    if (invalid) { setPageError(invalid); return; }
    setSettings({ ...settings, title: settings.title.trim(), introHeading: settings.introHeading.trim(), description: settings.description.trim(), minutes: String(Number(settings.minutes)) });
    try { const saved = await saveAdminPlacement(settings, configId, publish, rules); setConfigId(saved.id); setStatus(saved.status === "published" ? "Published" : "Draft"); setUpdatedAt(new Date().toISOString()); setPageError(""); setMessage(publish ? "Placement test diterbitkan." : "Draft placement test disimpan."); }
    catch (cause) { setPageError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi."); }
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const invalid = questionError(draft);
    if (invalid) { setError(invalid); return; }
    const order = Number(draft.order);
    const maxOrder = rows.length + (rows.some((row) => row.id === draft.id) ? 0 : 1);
    if (!/^\d+$/.test(draft.order) || !Number.isSafeInteger(order) || order < 1 || order > maxOrder) { setError(`Urutan harus berupa angka bulat dari 1 hingga ${maxOrder}.`); return; }
    if (!configId) { setError("Simpan Draft terlebih dahulu."); return; }
    try { await saveAdminPlacementQuestion(draft, configId, order); const fresh = await loadAdminPlacement(); setRows(fresh.questions.map(placementQuestionView)); closeEditor(); setMessage("Pertanyaan disimpan."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi."); }
  }

  async function saveRules() {
    if (!configId) { setPageError("Simpan Draft terlebih dahulu."); return; }
    try {
      await saveAdminPlacement(settings, configId, status === "Published", rules);
      setMessage("Aturan rekomendasi disimpan.");
      setPageError("");
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi.");
    }
  }

  async function toggleLeadStatus(lead: PlacementLead) {
    const nextStatus = lead.status === "new" ? "contacted" : "new";
    try {
      await updateAdminPlacementLead(lead.id, nextStatus);
      setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, status: nextStatus } : item));
      setMessage(`Status ${lead.name} diperbarui.`);
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : "Gagal memperbarui status lead.");
    }
  }


  async function move(id: string, direction: number) {
    if (!configId) return;
    const index = rows.findIndex(row => row.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= rows.length) return;
    const reordered = [...rows];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try { for (const [position, question] of reordered.entries()) await saveAdminPlacementQuestion(question, configId, position + 1); setRows(reordered); setMessage("Urutan pertanyaan diubah."); }
    catch (cause) { setPageError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi."); }
  }

  return <AdminShell current="/admin/placement-hasil"><main className="admin-public-prototype placement-admin admin-placement-prototype">
    <AdminPageHeader title="Placement Test" />
    <AdminTabs tabs={placementTabs} active={activeTab} onChange={handleTabChange} label="Navigasi Placement Test" />
    <div className="placement-tab-content">
      {message && <p className="placement-notice" role="status">{message}</p>}
      {pageError && <p className="placement-alert-error" role="alert">{pageError}</p>}

      {activeTab === "Soal" && <>
        <div className="placement-pub-bar"><div className="placement-pub-status"><span>Status:</span><AdminStatusBadge status={status} /><small>Terakhir diperbarui: {updatedAt ? new Date(updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</small></div>
          <div className="placement-pub-actions"><button type="button" className="button button-secondary" onClick={() => setPreview(true)}>Pratinjau Tes</button><button type="button" className="button button-secondary" onClick={() => saveConfiguration(false)}>Simpan Draft</button><button type="button" className="button button-primary" onClick={() => saveConfiguration(true)}>Terbitkan</button></div>
        </div>
        <AdminSection title="Pengaturan Placement Test" className="placement-settings-box"><div className="placement-settings-grid admin-prototype-form">
          <label className="admin-field placement-span-full">Judul Tes<input value={settings.title} onChange={(event) => updateSettings({ title: event.target.value })} required /></label>
          <label className="admin-field placement-span-full">Intro Heading<input value={settings.introHeading} onChange={(event) => updateSettings({ introHeading: event.target.value })} required /></label>
          <label className="admin-field">Durasi Pengerjaan (menit)<input type="number" min="1" step="1" value={settings.minutes} onChange={(event) => updateSettings({ minutes: event.target.value })} required /></label>
          <label className="admin-field placement-span-full">Deskripsi Tes<textarea rows={2} value={settings.description} onChange={(event) => updateSettings({ description: event.target.value })} required /></label>
        </div></AdminSection>
        <AdminSection title="Pertanyaan" className="placement-settings-box" actions={<button type="button" className="button button-primary" onClick={() => { setError(""); setDraft({ id: crypto.randomUUID(), prompt: "", answers: ["", "", "", ""], correct: "", category: categories[0], published: false, explanation: "", order: String(rows.length + 1) }); }}>Tambah Pertanyaan</button>}>
          {!rows.length ? <AdminEmptyState title="Belum ada pertanyaan dibuat." /> : <ol className="placement-outline-list admin-placement-question-list" aria-label="Daftar Pertanyaan Placement Test">{rows.map((row, index) => <li className="placement-outline-item admin-placement-question-card" key={row.id}>
            <div><div className="placement-outline-meta"><span className="placement-q-num">#{index + 1}</span><span className="placement-q-area">{row.category}</span><AdminStatusBadge status={row.published ? "Published" : "Draft"} /></div>
              <p className="placement-q-preview">{row.prompt}</p><small>Jawaban Benar: {row.correct}. {row.answers[letters.findIndex((letter) => letter === row.correct)]}</small>
              {(row.image || row.audio) && <p className="admin-placement-media-names">{[row.image?.name, row.audio?.name].filter(Boolean).join(" · ")}</p>}
            </div>
            <div className="placement-editor-actions admin-placement-question-actions">
              <button type="button" className="button button-secondary button-sm" aria-label={`Lihat pertanyaan ${index + 1}`} onClick={() => setView(row)}>Lihat</button>
              <button type="button" className="button button-secondary button-sm" aria-label={`Edit pertanyaan ${index + 1}`} onClick={() => { setError(""); setDraft({ ...row, answers: [...row.answers], order: String(index + 1) }); }}>Edit</button>
              <button type="button" className="button button-secondary button-sm" aria-label={`Duplikat pertanyaan ${index + 1}`} onClick={() => { setError(""); setDraft({ ...row, id: crypto.randomUUID(), answers: [...row.answers], published: false, order: String(index + 2) }); }}>Duplikat</button>
              <button type="button" className="button button-secondary button-sm" aria-label={`${row.published ? "Jadikan Draft" : "Publikasikan"} pertanyaan ${index + 1}`} onClick={() => { const invalid = row.published ? "" : questionError(row); if (invalid) { setPageError(invalid); return; } if (!configId) return; void saveAdminPlacementQuestion({ ...row, published: !row.published }, configId, index + 1).then(saved => { setRows(current => current.map(item => item.id === row.id ? placementQuestionView(saved) : item)); setMessage("Status pertanyaan diubah."); }).catch(cause => setPageError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi.")); }}>{row.published ? "Jadikan Draft" : "Publikasikan"}</button>
              <button type="button" className="button button-secondary button-sm" disabled={index === 0} aria-label={`Naikkan pertanyaan ${index + 1}`} onClick={() => move(row.id, -1)}>Naik</button>
              <button type="button" className="button button-secondary button-sm" disabled={index === rows.length - 1} aria-label={`Turunkan pertanyaan ${index + 1}`} onClick={() => move(row.id, 1)}>Turun</button>
              <button type="button" className="button button-secondary button-sm placement-text-danger" aria-label={`Hapus pertanyaan ${index + 1}`} onClick={() => setDeleting(row)}>Hapus</button>
            </div>
          </li>)}</ol>}
        </AdminSection>
      </>}

      {activeTab === "Aturan Hasil" && <AdminSection title="Aturan Rekomendasi Level" description="Tentukan level dan program yang direkomendasikan berdasarkan rentang skor persentase." actions={<div className="admin-page-actions"><button type="button" className="button button-primary" onClick={() => { setError(""); setRuleDraft({ minScore: 0, maxScore: 50, recommendedProgramCode: "N5", resultTitle: "Rekomendasi N5", resultDescription: "Disarankan memulai pembelajaran dari level N5." }); }}>Tambah Aturan</button><button type="button" className="button button-secondary" onClick={saveRules}>Simpan Aturan</button></div>}>
        <AdminDataTable
          caption="Aturan Rekomendasi"
          rows={rules}
          rowKey={(r) => `${r.minScore}-${r.maxScore}-${r.recommendedProgramCode}`}
          columns={[
            { key: "range", header: "Rentang Skor", cell: (r) => `${r.minScore}% – ${r.maxScore}%` },
            { key: "level", header: "Rekomendasi Level", cell: (r) => <AdminStatusBadge status={r.recommendedProgramCode} /> },
            { key: "title", header: "Judul Hasil", cell: (r) => r.resultTitle },
            { key: "description", header: "Deskripsi", cell: (r) => r.resultDescription },
          ]}
          actions={{
            cell: (r) => <div className="admin-page-actions"><button type="button" className="button" onClick={() => { setError(""); setRuleDraft({ ...r }); }}>Edit</button><button type="button" className="button" onClick={() => setRules((curr) => curr.filter((item) => item !== r))}>Hapus</button></div>
          }}
        />
      </AdminSection>}

      {activeTab === "Leads" && <AdminSection title="Hasil & Leads Peserta" description="Daftar peserta yang telah mengikuti Placement Test.">
        {leadsLoading && <p role="status">Memuat data leads…</p>}
        <AdminDataTable
          caption="Data Leads Placement Test"
          rows={leads}
          rowKey={(lead) => String(lead.id)}
          columns={[
            { key: "date", header: "Tanggal", cell: (lead) => new Date(lead.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) },
            { key: "name", header: "Nama", cell: (lead) => lead.name },
            { key: "whatsapp", header: "WhatsApp", cell: (lead) => <a href={`https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">{lead.whatsapp}</a> },
            { key: "target", header: "Target JLPT", cell: (lead) => lead.target },
            { key: "score", header: "Skor", cell: (lead) => lead.score !== null ? `${lead.score}%` : "—" },
            { key: "level", header: "Rekomendasi", cell: (lead) => lead.recommended_level ? <AdminStatusBadge status={lead.recommended_level} /> : "—" },
            { key: "status", header: "Status Kontak", cell: (lead) => <AdminStatusBadge status={lead.status === "contacted" ? "Sudah Dihubungi" : "Baru"} /> },
          ]}
          actions={{
            cell: (lead) => <button type="button" className="button" onClick={() => toggleLeadStatus(lead)}>{lead.status === "new" ? "Tandai Dihubungi" : "Tandai Baru"}</button>
          }}
        />
      </AdminSection>}
    </div>

    <AdminDialog open={Boolean(draft)} title={rows.some((row) => row.id === draft?.id) ? "Edit Pertanyaan" : "Tambah Pertanyaan"} close={closeEditor}>
      {draft && <form className="admin-prototype-form placement-editor-panel" onSubmit={saveQuestion} noValidate>
        <div className="placement-field-grid">
          <label className="admin-field placement-span-full">Pertanyaan<textarea rows={3} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} required /></label>
          <label className="admin-field">Kategori<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} required>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="admin-field">Status<select value={draft.published ? "published" : "draft"} onChange={(event) => setDraft({ ...draft, published: event.target.value === "published" })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
          <label className="admin-field placement-span-full">Gambar (Opsional)<input value={draft.imageUrl ?? ""} onChange={event => setDraft({ ...draft, imageUrl: event.target.value })} /></label><div className="placement-span-full"><AdminMediaUpload kind="image" onUploaded={imageUrl => setDraft({ ...draft, image: undefined, imageUrl })} /></div>
          <label className="admin-field placement-span-full">Audio (Opsional)<input value={draft.audioUrl ?? ""} onChange={event => setDraft({ ...draft, audioUrl: event.target.value })} /></label><div className="placement-span-full"><AdminMediaUpload kind="audio" onUploaded={audioUrl => setDraft({ ...draft, audio: undefined, audioUrl })} /></div>
          <div className="placement-span-full"><PlacementMedia image={draft.image} audio={draft.audio} /><div className="placement-editor-actions">{draft.image && <button type="button" className="button" onClick={() => setDraft({ ...draft, image: undefined })}>Hapus Gambar</button>}{draft.audio && <button type="button" className="button" onClick={() => setDraft({ ...draft, audio: undefined })}>Hapus Audio</button>}</div></div>
          <label className="admin-field placement-span-full">Penjelasan / Pembahasan (Opsional)<textarea rows={2} value={draft.explanation} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} /></label>
        </div>
        <fieldset className="placement-options-fieldset"><legend>Pilihan Jawaban (Pilihan Tunggal)</legend><div className="placement-options-list">{letters.map((letter, index) => <label className="admin-field" key={letter}>Jawaban {letter}<input value={draft.answers[index]} onChange={(event) => setDraft({ ...draft, answers: draft.answers.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer) })} required /></label>)}</div></fieldset>
        <label className="admin-field">Jawaban Benar<select value={draft.correct} onChange={(event) => setDraft({ ...draft, correct: event.target.value })} required><option value="">Pilih jawaban benar</option>{letters.map((letter) => <option key={letter} value={letter}>{letter}</option>)}</select></label>
        <label className="admin-field">Urutan<input type="number" min="1" max={rows.length + (rows.some((row) => row.id === draft.id) ? 0 : 1)} step="1" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} required /><small>Pertanyaan lain bergeser otomatis.</small></label>
        {error && <p className="placement-alert-error" role="alert">{error}</p>}
        <details className="admin-placement-editor-preview"><summary>Pratinjau Tes</summary><AdminPlacementPreview settings={settings} questions={[draft]} initialQuestionId={draft.id} /></details>
        <div className="admin-page-actions"><button type="button" className="button" onClick={closeEditor}>Batal</button><button type="submit" className="button button-primary">Simpan Pertanyaan</button></div>
      </form>}
    </AdminDialog>

    <AdminDialog open={Boolean(ruleDraft)} title="Aturan Rekomendasi" close={closeRuleDraft}>
      {ruleDraft && <form className="admin-prototype-form" onSubmit={(event) => {
        event.preventDefault();
        if (ruleDraft.minScore < 0 || ruleDraft.maxScore > 100 || ruleDraft.minScore > ruleDraft.maxScore) {
          setError("Rentang skor harus antara 0 hingga 100 dan Skor Maksimal >= Skor Minimal.");
          return;
        }
        setRules((curr) => {
          const filtered = curr.filter((r) => !(r.minScore === ruleDraft.minScore && r.maxScore === ruleDraft.maxScore));
          const updated = [...filtered, ruleDraft].sort((a, b) => a.minScore - b.minScore);
          return updated;
        });
        closeRuleDraft();
      }}>
        <label className="admin-field">Skor Minimal (%)<input required type="number" min="0" max="100" value={ruleDraft.minScore} onChange={(e) => setRuleDraft({ ...ruleDraft, minScore: Number(e.target.value) })} /></label>
        <label className="admin-field">Skor Maksimal (%)<input required type="number" min="0" max="100" value={ruleDraft.maxScore} onChange={(e) => setRuleDraft({ ...ruleDraft, maxScore: Number(e.target.value) })} /></label>
        <label className="admin-field">Rekomendasi Level<select value={ruleDraft.recommendedProgramCode} onChange={(e) => setRuleDraft({ ...ruleDraft, recommendedProgramCode: e.target.value })}>{jlptLevels.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}</select></label>
        <label className="admin-field">Judul Rekomendasi<input required value={ruleDraft.resultTitle} onChange={(e) => setRuleDraft({ ...ruleDraft, resultTitle: e.target.value })} /></label>
        <label className="admin-field">Deskripsi Rekomendasi<textarea required rows={3} value={ruleDraft.resultDescription} onChange={(e) => setRuleDraft({ ...ruleDraft, resultDescription: e.target.value })} /></label>
        {error && <p className="placement-alert-error" role="alert">{error}</p>}
        <div className="admin-page-actions"><button type="button" className="button" onClick={closeRuleDraft}>Batal</button><button type="submit" className="button button-primary">Simpan Aturan</button></div>
      </form>}
    </AdminDialog>

    <AdminDialog open={preview} title="Pratinjau Tes Placement" close={closePreview}>{preview && <AdminPlacementPreview settings={settings} questions={rows} />}</AdminDialog>
    <AdminDialog open={Boolean(view)} title="Detail Pertanyaan" close={closeView}>{view && <><AdminPlacementPreview settings={settings} questions={rows} initialQuestionId={view.id} /><article><p>Jawaban Benar: {view.correct}</p><p>Kategori: {view.category}</p><p>Urutan: {rows.findIndex((row) => row.id === view.id) + 1}</p><AdminStatusBadge status={view.published ? "Published" : "Draft"} />{view.explanation && <div><h3>Penjelasan / Pembahasan</h3><p>{view.explanation}</p></div>}</article></>}</AdminDialog>
    <AdminDialog open={Boolean(deleting)} title="Hapus Pertanyaan?" close={closeDelete} actions={<><button type="button" className="button" onClick={closeDelete}>Batal</button><button type="button" className="button button-primary" onClick={async () => { if (!deleting) return; try { await deleteAdminPlacementQuestion(deleting.id); setRows((current) => current.filter((row) => row.id !== deleting.id)); setDeleting(null); setMessage("Pertanyaan dihapus."); } catch (cause) { setPageError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Silakan coba lagi."); } }}>Hapus Pertanyaan</button></>}><p>{deleting?.prompt}</p><p>Hapus pertanyaan dari sesi ini? Placement publik tidak berubah.</p></AdminDialog>
  </main></AdminShell>;
}
