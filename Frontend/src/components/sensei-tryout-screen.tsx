"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useLearningRequest } from "@/components/learning-hooks";
import { BackendAssessmentRunner } from "@/components/backend-assessment-runner";

type TryOut = { id: number; program_id: number; title: string; max_score: number; section_passing_score: number; total_passing_score: number | null; sessions: Record<string, string> };
const loadTryOuts = (signal: AbortSignal) => apiRequest<{ data: TryOut[] }>("/api/student/try-outs", { signal }).then(response => response.data);

export function SenseiTryoutScreen({ membership = "sensei" }: { membership?: "lms" | "sensei" }) {
  const catalog = useLearningRequest(loadTryOuts, "try-outs");
  const [selected, setSelected] = useState<TryOut>();
  const [resumeId, setResumeId] = useState<number>();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const match = new URLSearchParams(window.location.search).get("tryout");
      if (match && /^[1-9]\d*$/.test(match)) setResumeId(Number(match));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const active = selected ?? catalog.data?.find(item => item.id === resumeId);
  const loadHistory = useCallback((signal: AbortSignal) => active ? apiRequest<{ data: { best_score: number | null; attempts: { id: number; status: string }[] } }>(`/api/student/try-outs/${active.id}/history`, { signal }).then(response => response.data) : Promise.resolve({ best_score: null, attempts: [] }), [active]);
  const history = useLearningRequest(loadHistory, `tryout-history-${active?.id ?? ""}`);
  if (active) return <div className="sensei-tryout" data-membership={membership}><button className="sensei-back" type="button" onClick={() => { setSelected(undefined); setResumeId(undefined); const url = new URL(window.location.href); url.searchParams.delete("tryout"); url.searchParams.delete("attempt"); window.history.replaceState(null, "", url); }}>Kembali ke Daftar</button><p>Best Score: {history.data?.best_score ?? "—"}</p>{history.error && <p role="alert">{history.error}</p>}<BackendAssessmentRunner path={`/api/student/try-outs/${active.id}/attempts`} domain="tryout" title={active.title} className="tryout-runner tryout-clean-focus" /></div>;
  return <div className="sensei-tryout"><header className="tryout-page-header"><div><h1>Try Out</h1><p>Simulasikan ujian sebelum ujian sebenarnya.</p></div></header>{catalog.error && <p role="alert">{catalog.error}<button type="button" onClick={catalog.retry}>Coba Lagi</button></p>}{catalog.loading && <p role="status">Memuat…</p>}<section className="tryout-catalog"><div className="tryout-catalog-toolbar"><h2>Simulasi yang tersedia</h2></div><div>{catalog.data?.map((item, index) => <article className="tryout-card" key={item.id}><div className="tryout-card-number">{String(index + 1).padStart(2, "0")}</div><div className="tryout-card-main"><header className="tryout-card-header"><h3>{item.title}</h3><span className="tryout-status-badge status-tersedia">TERSEDIA</span></header><div className="tryout-card-meta"><span>4 sesi • Bisa diulang tanpa batas</span></div></div><footer><button className="button button-primary" type="button" onClick={() => { setSelected(item); const url = new URL(window.location.href); url.searchParams.set("tryout", String(item.id)); url.searchParams.delete("attempt"); window.history.replaceState(null, "", url); }}>Mulai Try Out</button></footer></article>)}</div></section></div>;
}
