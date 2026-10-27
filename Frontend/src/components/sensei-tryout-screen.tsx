"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { apiRequest } from "@/lib/api";
import { useLearningRequest } from "@/components/learning-hooks";
import { BackendAssessmentRunner } from "@/components/backend-assessment-runner";

type TryOut = { id: number; program_id: number; level: string; title: string; max_score: number; section_passing_score: number; total_passing_score: number | null; sessions: Record<string, string> };
const loadTryOuts = (signal: AbortSignal) => apiRequest<{ data: TryOut[] }>("/api/student/try-outs", { signal }).then(response => response.data);

export function SenseiTryoutScreen({ membership = "sensei" }: { membership?: "lms" | "sensei" }) {
  const catalog = useLearningRequest(loadTryOuts, "try-outs");
  const [selected, setSelected] = useState<TryOut>();
  const [resumeId, setResumeId] = useState<number>();
  const [resumeRevision, setResumeRevision] = useState(0);
  const [historyRevision, setHistoryRevision] = useState(0);
  const refreshHistory = useCallback(() => setHistoryRevision(value => value + 1), []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const match = new URLSearchParams(window.location.search).get("tryout");
      if (match && /^[1-9]\d*$/.test(match)) setResumeId(Number(match));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const active = selected ?? catalog.data?.find(item => item.id === resumeId);
  const loadHistory = useCallback((signal: AbortSignal) => active ? apiRequest<{ data: { best_score: number | null; attempts: { id: number; status: string; expires_at?: string | null; server_now?: string }[] } }>(`/api/student/try-outs/${active.id}/history`, { signal }).then(response => response.data) : Promise.resolve({ best_score: null, attempts: [] }), [active]);
  const history = useLearningRequest(loadHistory, `tryout-history-${active?.id ?? ""}-${historyRevision}`);
  const resumable = history.data?.attempts.find(item => item.status === "in_progress" && (item.expires_at === null || (item.expires_at && item.server_now && Date.parse(item.expires_at) > Date.parse(item.server_now))));
  const resume = () => {
    if (!resumable) return;
    const url = new URL(window.location.href);
    url.searchParams.set("attempt", String(resumable.id));
    url.searchParams.delete("tryout_stage");
    url.searchParams.delete("tryout_question");
    window.history.replaceState(null, "", url);
    setResumeRevision(value => value + 1);
  };
  const backToList = () => { setSelected(undefined); setResumeId(undefined); const url = new URL(window.location.href); url.searchParams.delete("tryout"); url.searchParams.delete("attempt"); url.searchParams.delete("tryout_stage"); url.searchParams.delete("tryout_question"); window.history.replaceState(null, "", url); };
  if (active) return <div className="sensei-tryout" data-membership={membership}><button className="sensei-back" type="button" onClick={backToList}>Kembali ke Daftar</button><p>Best Score: {history.data?.best_score ?? "—"}</p>{history.error && <p role="alert">{history.error}</p>}<BackendAssessmentRunner key={`${active.id}-${resumeRevision}`} startActions={resumable ? busy => <div><p>Ada Try Out yang masih aktif. Lanjutkan untuk memakai jawaban dan waktu yang tersimpan, atau mulai attempt baru.</p><button className="button button-secondary" type="button" disabled={busy} onClick={resume}>Lanjutkan Try Out</button></div> : undefined} path={`/api/student/try-outs/${active.id}/attempts`} domain="tryout" title={active.title} className="tryout-runner tryout-clean-focus" onComplete={refreshHistory} onBack={backToList} /></div>;
  return <div className="sensei-tryout"><header className="tryout-page-header"><div><h1>Try Out</h1><p>Simulasikan ujian sebelum ujian sebenarnya.</p></div></header>{catalog.error && <p role="alert">{catalog.error}<button type="button" onClick={catalog.retry}>Coba Lagi</button></p>}{!catalog.data && !catalog.error && <LoadingSkeleton variant="list" label="Memuat…" />}<section className="tryout-catalog"><div className="tryout-catalog-toolbar"><h2>Simulasi yang tersedia</h2></div><div>{catalog.data?.map((item, index) => <article className="tryout-card" key={item.id}><div className="tryout-card-number">{String(index + 1).padStart(2, "0")}</div><div className="tryout-card-main"><header className="tryout-card-header"><h3>{item.title}</h3><span className="tryout-status-badge status-tersedia">TERSEDIA</span></header><div className="tryout-card-meta"><span>4 sesi • Bisa diulang tanpa batas</span></div></div><footer><button className="button button-primary" type="button" onClick={() => { setSelected(item); const url = new URL(window.location.href); url.searchParams.set("tryout", String(item.id)); url.searchParams.delete("attempt"); url.searchParams.delete("tryout_stage"); url.searchParams.delete("tryout_question"); window.history.replaceState(null, "", url); }}>Mulai Try Out</button></footer></article>)}</div></section></div>;
}
