"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AdminDataTable, AdminPageHeader, AdminSection, AdminTabs } from "@/components/admin-primitives";
import { PlacementRichText } from "@/components/placement-rich-text";
import { AssessmentPassageContent } from "@/components/assessment-passage-content";
import { useLearningRequest } from "@/components/learning-hooks";
import { downloadReport, loadReport, loadReportAttempt, loadReportParticipants, reportQuery, type ReportFilters, type ReportQuestion } from "@/lib/admin-tryout-results-api";
import { assessmentSessions, assessmentSessionLabels } from "@/lib/assessment-attempt";
import styles from "./admin-tryout-results.module.css";
const sectionLabel = (code: string) => assessmentSessionLabels[assessmentSessions.indexOf(code as typeof assessmentSessions[number])] ?? code;

const tabs = ["Ringkasan", "Peserta", "Analisis Soal", "Individual"];
const date = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) : "—";
const score = (value: number | null) => value === null ? "—" : String(value);
const versionKey = (question: ReportQuestion) => `${question.id}:${question.fingerprint}`;

const tryoutReports = { loadReport, loadReportParticipants, loadReportAttempt, downloadReport };
export type AdminResultsApi = Pick<typeof tryoutReports, "loadReport" | "loadReportParticipants" | "loadReportAttempt"> & { downloadReport?: typeof downloadReport };

export function AdminTryoutResults({ id, title, level, packages, onPackageChange, reportsApi = tryoutReports, assessmentLabel = "Try Out", showPassing = true }: { id: string; title: string; level: string; packages: { id: string; title: string; context: string }[]; onPackageChange: (id: string) => void; onClose: () => void; reportsApi?: AdminResultsApi; assessmentLabel?: string; showPassing?: boolean }) {
  const [tab, setTab] = useState(tabs[0]);
  const [filters, setFilters] = useState<ReportFilters>({ search: "", status: "all", date_from: "", date_to: "" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [attempt, setAttempt] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportController = useRef<AbortController | null>(null);
  const query = reportQuery(filters);
  const reportLoad = useCallback((signal: AbortSignal) => reportsApi.loadReport(id, filters, signal), [id, filters, reportsApi]);
  const peopleLoad = useCallback((signal: AbortSignal) => reportsApi.loadReportParticipants(id, filters, page, signal), [id, filters, page, reportsApi]);
  const attemptLoad = useCallback((signal: AbortSignal) => attempt === null ? Promise.resolve(null) : reportsApi.loadReportAttempt(id, attempt, filters, signal), [id, attempt, filters, reportsApi]);
  const report = useLearningRequest(reportLoad, `tryout-report:${id}:${query}`);
  const people = useLearningRequest(peopleLoad, `tryout-report-people:${id}:${query}:${page}`);
  const individual = useLearningRequest(attemptLoad, `tryout-report-attempt:${id}:${query}:${attempt}`);
  useEffect(() => () => { exportController.current?.abort(); }, [id, query]);
  function changeFilters(next: ReportFilters) { exportController.current?.abort(); setExporting(false); setExportError(""); setFilters(next); setPage(1); setAttempt(null); setSelected(""); }
  async function exportExcel() {
    if (exporting || !reportsApi.downloadReport) return;
    const controller = new AbortController();
    exportController.current = controller; setExporting(true); setExportError("");
    try {
      const blob = await reportsApi.downloadReport(id, filters, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `try-out-${id}-hasil.xlsx`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { if (!controller.signal.aborted) setExportError(cause instanceof Error ? cause.message : "Ekspor gagal. Coba lagi."); }
    finally { if (exportController.current === controller && !controller.signal.aborted) setExporting(false); }
  }
  function openAttempt(value: number) { setAttempt(value); setTab("Individual"); }
  const summary = report.data?.summary;
  const questions = report.data?.questions ?? [];
  function openQuestion(question: ReportQuestion) { setSelected(versionKey(question)); setTab("Analisis Soal"); }
  const detail = individual.data;
  return <div className={styles.workspace}>
    <AdminPageHeader title={`Analisis Hasil ${assessmentLabel}`} description={`${title} · ${level}`} actions={reportsApi.downloadReport && <button className="button button-primary" type="button" disabled={exporting} aria-busy={exporting} onClick={() => void exportExcel()}>{exporting ? "Mengunduh…" : "Unduh Excel"}</button>} />
    <details><summary>Tentang statistik laporan</summary><p className={styles.note}>Skor akhir mengikuti hasil tersimpan; belum ada pembulatan baru. Statistik hanya attempt selesai. Rata-rata memakai poin mentah, bukan persentase atau skor skala JLPT. Waktu ditampilkan dalam WIB.</p></details>
    <label className="admin-field">Paket {assessmentLabel}<select value={id} onChange={event => onPackageChange(event.target.value)}>{packages.map(item => <option key={item.id} value={item.id}>{item.title} · {item.context}</option>)}</select></label>
    <AdminSection><div className={styles.filters}>
      <label className="admin-field">Cari peserta<input type="search" placeholder="Nama peserta" maxLength={200} value={filters.search} onChange={event => changeFilters({ ...filters, search: event.target.value })} /></label>
      <label className="admin-field" hidden={!showPassing}>Hasil<select value={filters.status} onChange={event => changeFilters({ ...filters, status: event.target.value as ReportFilters["status"] })}><option value="all">Semua kelulusan</option><option value="passed">Lulus</option><option value="failed">Tidak lulus</option></select></label>
      <label className="admin-field">Selesai sejak<input type="date" value={filters.date_from} max={filters.date_to || undefined} onChange={event => changeFilters({ ...filters, date_from: event.target.value })} /></label>
      <label className="admin-field">Selesai sampai<input type="date" value={filters.date_to} min={filters.date_from || undefined} onChange={event => changeFilters({ ...filters, date_to: event.target.value })} /></label>
    </div><p className={styles.note}>{reportsApi.downloadReport ? "Filter berlaku untuk laporan dan seluruh baris ekspor Excel, bukan hanya halaman peserta aktif." : "Filter berlaku untuk seluruh laporan, bukan hanya halaman peserta aktif."}</p></AdminSection>
    {exportError && <p role="alert">{exportError}</p>}
    <AdminTabs tabs={tabs} active={tab} onChange={setTab} label={`Tampilan hasil ${assessmentLabel}`}>
    {(tab === "Ringkasan" || tab === "Analisis Soal") && <>
      {report.loading && <p role="status">Memuat laporan…</p>}
      {report.error && <p role="alert">{report.error} <button className="button" type="button" onClick={report.retry}>Coba Lagi</button></p>}
      {report.data && summary && (summary.responses === 0 ? <AdminSection><p>Belum ada attempt selesai sesuai filter.</p></AdminSection> : tab === "Ringkasan" ? <>
        <div className={styles.cards}>{[["Total attempt selesai", summary.responses], ["Rata-rata poin mentah", score(summary.mean)], ["Median", score(summary.median)], ["Rentang skor", `${score(summary.min)}–${score(summary.max)}`]].map(([label, value]) => <section className={styles.card} key={label}><h2>{label}</h2><strong>{value}</strong></section>)}</div>
        <div className={styles.summaryMeta}><span>Peserta unik: <strong>{summary.unique_participants}</strong></span>{showPassing && <><span>Lulus: <strong>{summary.passed}</strong></span><span>Tidak lulus: <strong>{summary.failed}</strong></span></>}</div>
        <div className={styles.overviewGrid}>
          <AdminSection title="Distribusi skor"><ScoreHistogram buckets={report.data.histogram} /></AdminSection>
          <AdminSection title="Soal tersulit"><p className={styles.note}>Persentase dari attempt yang menerima versi soal ini, termasuk jawaban kosong.</p>{report.data.hardest.length ? <ul className={styles.hardest}>{report.data.hardest.slice(0, 5).map(question => <li key={versionKey(question)}><div className={styles.listHeading}><strong>Soal {question.number} · {sectionLabel(question.section)}</strong><strong>{score(question.correct_percentage)}% benar</strong></div><p className={styles.snippet}>{plainText(question.question)}</p><BlankNotice question={question} /><meter min={0} max={100} value={question.correct_percentage ?? 0} aria-label={`Soal ${question.number}: ${score(question.correct_percentage)}% benar`} /><small>{question.correct} benar · {question.wrong} salah · {question.unanswered} kosong</small><button type="button" className="button" aria-label={`Lihat analisis soal ${question.number}`} onClick={() => openQuestion(question)}>Lihat analisis</button></li>)}</ul> : <p>Belum ada analisis soal.</p>}<button type="button" className="button" onClick={() => setTab("Analisis Soal")}>Lihat semua soal</button></AdminSection>
        </div>
      </> : <QuestionExplorer questions={questions} selected={selected} onSelect={setSelected} />)}
    </>}
    {(tab === "Peserta" || (tab === "Individual" && attempt === null)) && <AdminSection title={tab === "Individual" ? "Pilih attempt peserta" : "Peserta"}>
      {people.error && <p role="alert">{people.error} <button type="button" className="button" onClick={people.retry}>Coba Lagi</button></p>}
      <AdminDataTable caption="Attempt selesai peserta" loading={people.loading} rows={people.data?.data ?? []} rowKey={row => String(row.id)} empty={people.error ? "Data gagal dimuat." : "Belum ada attempt selesai sesuai filter."} columns={[
        { key: "name", header: "Nama", cell: row => row.name }, { key: "whatsapp", header: "WhatsApp", cell: row => row.whatsapp || "—" },
        { key: "started", header: "Mulai (WIB)", cell: row => date(row.started_at) }, { key: "completed", header: "Selesai (WIB)", cell: row => date(row.completed_at) },
        { key: "raw", header: "Skor mentah", cell: row => score(row.raw_score) }, { key: "final", header: "Skor final", cell: row => `${score(row.final_score)} / ${score(row.max_score)}` },
        ...(showPassing ? [{ key: "pass", header: "Hasil", cell: (row: import("@/lib/admin-tryout-results-api").ReportParticipant) => row.overall_pass ? "Lulus" : "Tidak lulus" }] : []),
      ]} actions={{ cell: row => <button className="button" type="button" onClick={() => openAttempt(row.id)}>Detail Individual</button> }} />
      {people.data && <nav className={styles.pagination} aria-label="Halaman peserta"><button className="button" type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Sebelumnya</button><span role="status">Halaman {people.data.meta.current_page} / {people.data.meta.last_page} · {people.data.meta.total} attempt</span><button className="button" type="button" disabled={page >= people.data.meta.last_page} onClick={() => setPage(value => value + 1)}>Berikutnya</button></nav>}
    </AdminSection>}
    {tab === "Individual" && attempt !== null && <AdminSection title="Hasil individual" description="Ringkasan hasil, skor per bagian, dan jawaban peserta." className={styles.individual} actions={<button className="button" type="button" onClick={() => setAttempt(null)}>Pilih Peserta / Attempt Lain</button>}>
      {individual.loading && <p role="status">Memuat snapshot attempt…</p>}
      {individual.error && <p role="alert">{individual.error} <button className="button" type="button" onClick={individual.retry}>Coba Lagi</button></p>}
      {detail && <>
        <div className={styles.participantCard}>
          <div className={styles.participantHeading}>
            <div><p className={styles.note}>Attempt #{detail.participant.id}</p><h3>{detail.participant.name}</h3><p className={styles.note}>WhatsApp: {detail.participant.whatsapp || "—"}</p></div>
            {showPassing && <span className={`${styles.badge} ${detail.participant.overall_pass ? styles.passed : styles.failed}`}>{detail.participant.overall_pass ? "Lulus" : "Tidak lulus"}</span>}
          </div>
          <dl className={styles.attemptMetrics}>
            <div><dt>Skor final</dt><dd>{score(detail.participant.final_score)} <span>/ {score(detail.participant.max_score)}</span></dd></div>
            <div><dt>Skor mentah</dt><dd>{score(detail.participant.raw_score)}</dd></div>
            <div><dt>Mulai (WIB)</dt><dd>{date(detail.participant.started_at)}</dd></div>
            <div><dt>Selesai (WIB)</dt><dd>{date(detail.participant.completed_at)}</dd></div>
          </dl>
        </div>
        <div className={styles.attemptPicker}><div><h3>Riwayat attempt</h3><p className={styles.note}>Pilih attempt selesai untuk melihat detail hasilnya.</p></div><label className="admin-field">Attempt selesai peserta ini<select value={attempt} onChange={event => setAttempt(Number(event.target.value))}>{!detail.attempts.some(item => item.id === attempt) && <option value={attempt}>Attempt #{attempt}</option>}{detail.attempts.map(item => <option key={item.id} value={item.id}>#{item.id} · {date(item.completed_at)} · Skor {score(item.raw_score)}</option>)}</select></label></div>
        <AdminDataTable caption="Skor per bagian" rows={detail.participant.sessions} rowKey={row => row.code} columns={[{ key: "section", header: "Bagian", cell: row => row.label || sectionLabel(row.code) }, { key: "score", header: "Poin", cell: row => `${score(row.earned)} / ${score(row.max)}` }, { key: "correct", header: "Benar", cell: row => row.correct }, { key: "wrong", header: "Salah", cell: row => row.wrong }, { key: "blank", header: "Kosong", cell: row => row.unanswered }, { key: "pass", header: "Hasil", cell: row => showPassing ? <span className={`${styles.badge} ${row.pass ? styles.passed : styles.failed}`}>{row.pass ? "Lulus" : "Tidak lulus"}</span> : "—" }]} />
        <section className={styles.snapshot} aria-label="Snapshot jawaban">
          <header className={styles.snapshotHeading}><div><h3>Snapshot jawaban</h3><p className={styles.note}>Jawaban peserta dan kunci dari attempt ini.</p></div><span className={styles.note}>{detail.questions.length} soal</span></header>
          {detail.questions.map(question => <article className={styles.question} key={`${question.number}:${question.id}`}>
            <header className={styles.questionHeading}><div><p className={styles.note}>{sectionLabel(question.session)}</p><h4>Soal {question.number}</h4></div><div className={styles.answerMeta}><span className={`${styles.badge} ${question.answer === null ? styles.unanswered : question.answer === question.correct_option ? styles.passed : styles.failed}`}>{question.answer === null ? "Kosong" : question.answer === question.correct_option ? "Benar" : "Salah"}</span><strong>Poin {score(question.earned)} / {score(question.point_value)}</strong></div></header>
            {(question.reading_passage || question.passage?.body || question.passage?.blocks?.length) && <div className={styles.passage}><AssessmentPassageContent passage={question.passage ? { ...question.passage, body: question.passage.body ?? "" } : { body: question.reading_passage ?? "" }} /></div>}
            <PlacementRichText value={question.question} />
            <ul className={styles.options}>{Object.entries(question.options).map(([letter, text]) => <li key={letter} className={letter === question.correct_option ? styles.correct : letter === question.answer ? styles.wrongAnswer : undefined}><div className={styles.optionHeading}><strong>{letter}.</strong><div className={styles.answerMeta}>{letter === question.answer && <span className={styles.badge}>Dipilih</span>}{letter === question.correct_option && <span className={`${styles.badge} ${styles.passed}`}>Kunci benar</span>}</div></div><PlacementRichText value={text} /></li>)}</ul>
            <p className={styles.note}>Jawaban: {question.answer ?? "Kosong"} · Kunci: {question.correct_option}</p>
            {question.explanation && <div className={styles.explanation}><h5>Pembahasan</h5><PlacementRichText value={question.explanation} /></div>}
          </article>)}
          {!detail.questions.length && <p className={styles.note}>Snapshot soal kosong.</p>}
        </section>
      </>}
    </AdminSection>}
    </AdminTabs>
  </div>;
}

const plainText = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function BlankNotice({ question }: { question: ReportQuestion }) {
  return question.received > 0 && question.unanswered === question.received ? <p className={styles.blankNotice}>Belum dijawab oleh peserta</p> : null;
}

function ScoreHistogram({ buckets }: { buckets: { label: string; count: number }[] }) {
  if (!buckets.length) return <p>Belum ada distribusi skor.</p>;
  return <figure className={styles.figure} aria-label="Distribusi skor">
    <figcaption>Jumlah attempt per rentang skor</figcaption>
    <div className={styles.chart}><ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={buckets} margin={{ top: 16, right: 16, bottom: 28, left: 8 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e5ec" />
        <XAxis dataKey="label" label={{ value: "Rentang skor", position: "bottom", offset: 12 }} tick={{ fontSize: 12 }} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} width={40} label={{ value: "Attempt", angle: -90, position: "insideLeft" }} />
        <Tooltip formatter={value => [`${value} respons`, "Jumlah attempt"]} labelFormatter={label => `Skor ${label}`} />
        <Bar dataKey="count" name="Jumlah attempt" fill="#f48220" radius={[6, 6, 0, 0]} maxBarSize={80} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer></div>
    <details><summary>Data distribusi skor</summary><table className={styles.chartTable}><caption>Frekuensi skor dari API</caption><thead><tr><th>Rentang skor</th><th>Jumlah attempt</th></tr></thead><tbody>{buckets.map(bucket => <tr key={bucket.label}><th scope="row">{bucket.label}</th><td>{bucket.count}</td></tr>)}</tbody></table></details>
  </figure>;
}

function QuestionExplorer({ questions, selected, onSelect }: { questions: ReportQuestion[]; selected: string; onSelect: (key: string) => void }) {
  const [section, setSection] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = questions.filter(question => (section === "all" || question.section === section) && `${question.number} ${plainText(question.question)}`.toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID")));
  const active = filtered.find(question => versionKey(question) === selected) ?? filtered[0];
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pages);
  const versionLabel = (question: ReportQuestion) => `Versi ${questions.filter(item => item.id === question.id).findIndex(item => versionKey(item) === versionKey(question)) + 1}`;
  function choose(key: string) { onSelect(key); setPage(Math.max(1, Math.ceil((filtered.findIndex(question => versionKey(question) === key) + 1) / 8))); }
  return <AdminSection title="Analisis Soal">
    <div className={styles.analysisFilters}>
      <label className="admin-field">Filter section<select value={section} onChange={event => { setSection(event.target.value); setPage(1); }}><option value="all">Semua</option>{assessmentSessions.map(code => <option key={code} value={code}>{sectionLabel(code)}</option>)}</select></label>
      <label className="admin-field">Cari soal<input type="search" placeholder="Nomor atau teks soal" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <label className="admin-field">Pilih soal<select value={active ? versionKey(active) : ""} onChange={event => choose(event.target.value)}>{!filtered.length && <option value="">Tidak ada soal</option>}{filtered.map(question => <option key={versionKey(question)} value={versionKey(question)}>Soal {question.number} · {sectionLabel(question.section)} · {versionLabel(question)}</option>)}</select></label>
    </div>
    {!filtered.length ? <p>Tidak ada soal sesuai pencarian atau filter.</p> : <div className={styles.analysisGrid}>
      <aside aria-label="Daftar analisis soal"><div className={styles.questionList}>{filtered.slice((currentPage - 1) * 8, currentPage * 8).map(question => <button className={styles.questionChoice} type="button" key={versionKey(question)} aria-pressed={active && versionKey(active) === versionKey(question)} onClick={() => onSelect(versionKey(question))}><strong>Soal {question.number} · {sectionLabel(question.section)}</strong><span className={styles.snippet}>{plainText(question.question)}</span><small>{versionLabel(question)} · {score(question.correct_percentage)}% benar · {question.received} respons</small></button>)}</div>
        <nav className={styles.pagination} aria-label="Halaman soal"><button className="button" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Soal sebelumnya">Sebelumnya</button><span>{currentPage} / {pages}</span><button className="button" type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)} aria-label="Soal berikutnya">Berikutnya</button></nav>
      </aside>
      {active && <QuestionAnalysis question={active} version={versionLabel(active)} />}
    </div>}
  </AdminSection>;
}

function QuestionAnalysis({ question, version }: { question: ReportQuestion; version: string }) {
  const data = [...["A", "B", "C", "D"].map(letter => ({ label: letter, count: question.distribution[letter]?.count ?? 0, percentage: question.distribution[letter]?.percentage ?? 0 })), { label: "Kosong", count: question.unanswered, percentage: question.received ? Math.round(question.unanswered / question.received * 10000) / 100 : 0 }];
  return <article className={styles.analysisDetail} aria-label="Detail analisis soal">
    <header><p className={styles.note}>{version}</p><h3>Soal {question.number} — {sectionLabel(question.section)}</h3></header>
    <PlacementRichText value={question.question} />
    <div className={styles.questionStats}>{[["Menerima soal", question.received], ["Benar", question.correct], ["Salah", question.wrong], ["Kosong", question.unanswered], ["Persentase benar", `${score(question.correct_percentage)}%`]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <BlankNotice question={question} />
    <p className={styles.note}>Penyebut: {question.received} attempt menerima versi ini. {question.not_received} attempt tidak menerima soal ini.</p>
    <figure className={styles.figure} aria-label="Distribusi jawaban"><figcaption>Distribusi jawaban · Kunci benar: {question.correct_option}</figcaption>
      <div className={styles.chart}><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 20, left: 0 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e5ec" />
        <XAxis type="number" domain={[0, Math.max(1, question.received)]} allowDecimals={false} label={{ value: "Jumlah jawaban", position: "bottom", offset: 0 }} />
        <YAxis type="category" dataKey="label" width={64} />
        <Tooltip formatter={(value, _name, item) => [`${value} jawaban (${item.payload.percentage}%)`, item.payload.label === question.correct_option ? "Kunci benar" : "Respons"]} />
        <Bar dataKey="count" name="Jawaban" barSize={28} radius={[0, 5, 5, 0]} isAnimationActive={false}>{data.map(item => <Cell key={item.label} fill={item.label === question.correct_option ? "#198754" : item.label === "Kosong" ? "#94a3b8" : "#f48220"} />)}</Bar>
      </BarChart></ResponsiveContainer></div>
      <table className={styles.chartTable}><caption>Jumlah dan persentase jawaban</caption><thead><tr><th>Pilihan</th><th>Jumlah</th><th>Persentase</th></tr></thead><tbody>{data.map(item => <tr key={item.label}><th scope="row">{item.label}{item.label === question.correct_option ? " — benar" : ""}</th><td>{item.count}</td><td>{item.percentage}%</td></tr>)}</tbody></table>
    </figure>
    <ul className={styles.options}>{Object.entries(question.options).map(([letter, text]) => <li key={letter} className={letter === question.correct_option ? styles.correct : undefined}><strong>{letter}.{letter === question.correct_option ? " Kunci benar" : ""}</strong><PlacementRichText value={text} /></li>)}</ul>
    <details><summary>Detail teknis snapshot</summary><p>ID soal: {question.id} · {version}</p><p className={styles.fingerprint}>Fingerprint: {question.fingerprint}</p></details>
  </article>;
}
