"use client";

import { PlacementRichText } from "@/components/placement-rich-text";

import { useEffect, useId, useRef, useState } from "react";
import { LuFlag } from "react-icons/lu";
import { adminMediaUrl } from "@/lib/admin-media";
import { assessmentLetters, assessmentSections, orderedAssessmentQuestions, type AdminAssessment, type AdminAssessmentQuestion } from "@/components/admin-assessment-fixtures";

function AssessmentAudio({ question }: { question: AdminAssessmentQuestion }) {
  const player = useRef<HTMLAudioElement>(null);
  const file = question.file;
  useEffect(() => {
    const element = player.current;
    if (!element || !file) return;
    const url = URL.createObjectURL(file);
    element.src = url;
    return () => { element.pause(); element.removeAttribute("src"); element.load(); URL.revokeObjectURL(url); };
  }, [file]);
  return <section className="audio-player"><strong>{question.section}</strong>{file ? <audio ref={player} controls preload="metadata" aria-label={question.prompt} /> : question.audioUrl ? <audio src={adminMediaUrl(question.audioUrl)} controls preload="metadata" aria-label={question.prompt} /> : <p>Belum ada audio.</p>}</section>;
}

export function AdminAssessmentPreview(props: { assessment: AdminAssessment; initialQuestionId?: string }) {
  return <AssessmentPreview key={`${props.assessment.kind}-${props.assessment.id}`} {...props} />;
}
function AssessmentPreview({ assessment, initialQuestionId }: { assessment: AdminAssessment; initialQuestionId?: string }) {
  const [view, setView] = useState(initialQuestionId ? "Runner" : "Detail");
  const [section, setSection] = useState(() => assessment.questions.find((question) => question.id === initialQuestionId)?.section ?? "");
  const [questionId, setQuestionId] = useState(initialQuestionId ?? "");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [marked, setMarked] = useState<string[]>([]);
  const [sampleScores, setSampleScores] = useState<Record<string, string>>({});
  const radioName = useId();
  const mini = assessment.kind === "mini";
  const title = mini ? "Mini Checkpoint" : assessment.kind === "checkpoint" ? "Checkpoint" : "Try Out";
  const sections = assessmentSections(assessment);
  const activeSection = sections.includes(section) ? section : sections[0];
  const ordered = orderedAssessmentQuestions(assessment);
  const questions = ordered.filter((question) => question.section === activeSection);
  const question = questions.find((item) => item.id === questionId) ?? questions[0];
  const index = questions.findIndex((item) => item.id === question?.id);
  const globalNumber = ordered.findIndex((item) => item.id === question?.id) + 1;
  const answered = ordered.filter((item) => answers[item.id] !== undefined).length;
  const markedCount = ordered.filter((item) => marked.includes(item.id)).length;
  const maxScore = mini ? Number(assessment.maxScore) || 0 : 180;
  const sectionMax = maxScore / sections.length;
  const correctCounts = sections.map(name => ordered.filter(item => item.section === name && answers[item.id] === item.correctAnswer).length);
  const sectionMaximums = sections.map(name => mini ? sectionMax : ordered.filter(item => item.section === name).reduce((sum, item) => sum + (item.pointValue ?? 1), 0));
  const scores = sections.map((name) => mini ? Number(sampleScores[name] || 0) : ordered.filter(item => item.section === name && answers[item.id] === item.correctAnswer).reduce((sum, item) => sum + (item.pointValue ?? 1), 0));
  const sampleValid = scores.every((score, index) => Number.isFinite(score) && score >= 0 && score <= sectionMaximums[index]);
  const total = scores.reduce((sum, score) => sum + score, 0);
  const threshold = assessment.passingScore;
  const thresholdConfigured = threshold !== "" && /^\d+(\.\d+)?$/.test(threshold) && Number(threshold) <= maxScore;
  const passed = sampleValid && (mini ? total >= Number(threshold) : correctCounts.length === 4 && correctCounts.every(count => count >= 19));
  const weakest = sections[scores.indexOf(Math.min(...scores))];
  const resultStatus = !mini && answered === 0 ? "Belum ada jawaban pratinjau." : mini && !thresholdConfigured ? "OPEN: passing score belum dikonfigurasi" : !sampleValid ? "OPEN: skor contoh tidak valid" : passed ? "LULUS" : "TIDAK LULUS";
  return <section className="admin-assessment-preview" aria-label={`Pratinjau ${title}`}>
    <h2>{assessment.title}</h2><p>ID: {assessment.id}</p>
    <p>{mini ? "Pratinjau visual saja. Pilihan jawaban tidak menghasilkan skor, progres, atau penyimpanan siswa." : "Pratinjau admin saja. Penilaian lokal tidak menyimpan hasil atau progres siswa."}</p>
    <div className="admin-page-actions">{["Detail", "Runner", "Hasil"].map((name) => <button className="button" type="button" aria-pressed={view === name} key={name} onClick={() => setView(name)}>{name}</button>)}</div>
    {view === "Detail" && <div className={mini ? "mini-info" : "sensei-tryout tryout-prestart"}><div className="tryout-prestart-layout"><section className="tryout-prestart-info"><p className="dash-kicker">INFORMASI SIMULASI</p><h2>{assessment.title}</h2><p>{assessment.context}{mini && ` • ${assessment.chapter} • Sesi ${assessment.session} • Part ${assessment.part}`}</p><div className="tryout-info-tiles"><div><strong>{assessment.duration || "OPEN"} Menit</strong><span>Total Waktu</span></div><div><strong>{sections.length} Sesi</strong><span>Pembagian</span></div><div><strong>{assessment.maxScore || "OPEN"} Poin</strong><span>Skor Maksimal</span></div><div><strong>{mini ? threshold || "OPEN" : "Review Mode"}</strong><span>{mini ? "Passing score" : "Tersedia"}</span></div></div><p>{ordered.length} soal • {ordered.filter((item) => item.status === "Published").length} Published • {assessment.status}</p>{!mini && <p>Lulus jika keempat sesi masing-masing memiliki minimal 19 jawaban benar. {title} dapat diulang tanpa batas.</p>}<button className="button button-primary" type="button" onClick={() => setView("Runner")}>Mulai {title}</button></section><aside className="tryout-prestart-sidebar"><section className="tryout-sections"><h2>Materi Sesi</h2>{sections.map((name) => <div key={name}><strong>{name}</strong><small>{ordered.filter((item) => item.section === name).length} soal</small></div>)}</section></aside></div></div>}
    {view === "Runner" && <div className={mini ? "mini-runner" : "sensei-tryout tryout-runner tryout-clean-focus"}>
      <header className="tryout-focus-header"><div><h2>Soal {globalNumber} dari {ordered.length}</h2><p>{assessment.title} • {activeSection}</p></div><div className="tryout-focus-timer"><span>Timer</span><strong>{assessment.duration ? `${assessment.duration}:00` : "OPEN"}</strong><small>Contoh timer, tidak berjalan</small></div></header>
      <div className="tryout-focus-status"><span><strong>{answered}/{ordered.length}</strong> Dijawab</span><span><strong>{markedCount}</strong> Ditandai</span></div>
      <div className={mini ? "mini-runner-layout" : "tryout-focus-layout"}><div>
        {question ? <>{question.type === "Audio" && <AssessmentAudio key={question.id} question={question} />}{question.type === "Reading" && <section className="reading-passage"><p className="dash-kicker">TEKS BACAAN</p><p lang="ja"><PlacementRichText value={question.passage || "OPEN: teks bacaan belum tersedia."} /></p></section>}
          <section className={mini ? "learning-question-card" : "tryout-focus-question"}><p className="dash-kicker">BAGIAN {question.section.toUpperCase()} • SOAL {globalNumber} • {question.status}</p><h2><PlacementRichText value={question.prompt} /></h2>{question.instruction && <p><PlacementRichText value={question.instruction} /></p>}{question.japanese && <p lang="ja" className={mini ? "mini-question-japanese" : "tryout-question-japanese"}>{question.japanese.reading ? <ruby>{question.japanese.text}<rt>{question.japanese.reading}</rt></ruby> : question.japanese.text}</p>}<fieldset><legend className="sr-only">Pilih satu jawaban</legend>{question.answers.map((answer, answerIndex) => <label className={answers[question.id] === answerIndex ? "selected" : ""} key={answerIndex}><input type="radio" name={`${radioName}-${question.id}`} checked={answers[question.id] === answerIndex} onChange={() => setAnswers((current) => ({ ...current, [question.id]: answerIndex }))} /><span className="tryout-option-letter">{assessmentLetters[answerIndex]}</span><span><PlacementRichText value={answer} /></span></label>)}</fieldset></section>
          <div className={mini ? "mini-question-actions" : "tryout-focus-actions"}><button type="button" disabled={index <= 0} onClick={() => setQuestionId(questions[index - 1].id)}>Sebelumnya</button><button type="button" className={marked.includes(question.id) ? "marked" : ""} onClick={() => setMarked((current) => current.includes(question.id) ? current.filter((id) => id !== question.id) : [...current, question.id])}><LuFlag aria-hidden="true" /> Tandai Soal</button><button type="button" disabled={index >= questions.length - 1} onClick={() => setQuestionId(questions[index + 1].id)}>Selanjutnya</button></div>
        </> : <p>Belum ada data</p>}
      </div><aside className="tryout-focus-navigator"><p className="dash-kicker">NAVIGATOR SOAL</p><div className="tryout-number-grid">{questions.map((item) => { const number = ordered.findIndex((candidate) => candidate.id === item.id) + 1; return <button key={item.id} type="button" aria-label={`Soal ${number}`} aria-current={item.id === question?.id ? "step" : undefined} className={`${item.id === question?.id ? "active" : ""} ${answers[item.id] !== undefined ? "answered" : ""} ${marked.includes(item.id) ? "marked" : ""}`} onClick={() => setQuestionId(item.id)}>{number}</button>; })}</div><div className="tryout-session-list">{sections.map((name) => <button type="button" key={name} aria-pressed={name === activeSection} onClick={() => { setSection(name); setQuestionId(""); }}>{name} • {ordered.filter((item) => item.section === name).length} soal</button>)}</div><button className="button" type="button" onClick={() => setView("Hasil")}>Hasil contoh</button></aside></div>
    </div>}
    {view === "Hasil" && <div className={mini ? "mini-result tryout-result-report" : "sensei-tryout tryout-result-report"}><header className="tryout-result-header"><h2>Hasil {title}</h2><p>{mini ? "Skor contoh manual, bukan hasil penilaian jawaban." : "Skor pratinjau lokal. Setiap sesi lulus dengan minimal 19 jawaban benar."}</p></header><section className="tryout-score-report"><div className="tryout-section-scores"><h2><span lang="ja">得点区分別得点</span><small>Scores by Scoring Section</small></h2>{sections.map((name, scoreIndex) => <article key={name}><div><strong>{name}</strong>{mini ? <label className="admin-field">Skor contoh<input type="number" min="0" max={sectionMax} step="any" value={sampleScores[name] ?? "0"} onChange={(event) => setSampleScores((current) => ({ ...current, [name]: event.target.value }))} /></label> : <small>{correctCounts[scoreIndex]} jawaban benar • Passing score: 19</small>}</div><b>{scores[scoreIndex]} / {sectionMaximums[scoreIndex]}</b></article>)}</div><div className="tryout-total-score"><span lang="ja">総合得点</span><small>Total Score</small><strong>{sampleValid ? total : "—"}</strong><em>/ {maxScore}</em><b role="status">{resultStatus}</b></div></section><section className="tryout-lower-grid"><section className="tryout-reference-info"><h2>Reference Information</h2><dl><div><dt>Jumlah Soal</dt><dd>{ordered.length}</dd></div><div><dt>Jawaban Benar</dt><dd>{mini ? "Belum dinilai" : correctCounts.reduce((sum, count) => sum + count, 0)}</dd></div><div><dt>Jawaban Salah</dt><dd>{mini ? "Belum dinilai" : answered - correctCounts.reduce((sum, count) => sum + count, 0)}</dd></div><div><dt>Tidak Dijawab</dt><dd>{ordered.length - answered}</dd></div><div><dt>Waktu Pengerjaan</dt><dd>Belum direkam</dd></div><div><dt>Passing score</dt><dd>{threshold || "OPEN"}</dd></div></dl></section><aside className="tryout-recommendation"><h2>Rekomendasi Belajar</h2><h3>Fokus utama: {sampleValid ? weakest : "OPEN"}</h3><p>Review bagian dengan skor terendah dan tinjau kembali jawaban yang belum tepat.</p><ul><li>Review Kosakata</li><li>Kumpulan Flashcard</li></ul></aside></section>
      <section className="tryout-review"><h2>Ulasan Jawaban</h2>{question ? <div className="tryout-review-placeholder"><h3><PlacementRichText value={question.prompt} /></h3><p>Jawaban benar: {assessmentLetters[question.correctAnswer] ?? "OPEN"}. <PlacementRichText value={question.answers[question.correctAnswer] ?? ""} /></p><p><PlacementRichText value={question.explanation || "OPEN: penjelasan belum tersedia."} /></p></div> : <p>Belum ada data</p>}</section></div>}
  </section>;
}
