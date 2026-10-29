"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { apiRequest } from "@/lib/api";
import { useLearningRequest } from "@/components/learning-hooks";
import { BackendAssessmentRunner } from "@/components/backend-assessment-runner";

type TryOut = { duration_minutes?: number | null; question_count?: number; published_question_count?: number; access_type?: "free" | "membership"; can_access?: boolean; id: number; program_id: number; level: string; title: string; max_score: number; section_passing_score: number; total_passing_score: number | null; sessions: Record<string, string> };
const loadTryOuts = (signal: AbortSignal) => apiRequest<{ data: TryOut[] }>("/api/student/try-outs", { signal }).then(response => response.data);

export function SenseiTryoutScreen({ membership = "sensei", kind = "tryout" }: { membership?: "free" | "lms" | "sensei"; kind?: "tryout" | "checkpoint" }) {
  const checkpoint = kind === "checkpoint";
  const title = checkpoint ? "Checkpoint" : "Try Out";
  const endpoint = checkpoint ? "/api/student/checkpoint-packages" : "/api/student/try-outs";
  const loadCatalog = useCallback((signal: AbortSignal) => checkpoint ? apiRequest<{ data: (TryOut & { program: { code: string } })[] }>(endpoint, { signal }).then(response => response.data.map(item => ({ ...item, level: item.program.code }))) : loadTryOuts(signal), [checkpoint, endpoint]);
  const catalog = useLearningRequest(loadCatalog, endpoint);
  const [selected, setSelected] = useState<TryOut>();
  const [resumeId, setResumeId] = useState<number>();
  const [resumeRevision, setResumeRevision] = useState(0);
  const [historyRevision, setHistoryRevision] = useState(0);
  const refreshHistory = useCallback(() => setHistoryRevision(value => value + 1), []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const match = new URLSearchParams(window.location.search).get(kind);
      if (match && /^[1-9]\d*$/.test(match)) setResumeId(Number(match));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [kind]);
  const active = selected ?? catalog.data?.find(item => item.id === resumeId);
  const loadHistory = useCallback((signal: AbortSignal) => active ? apiRequest<{ data: { best_score: number | null; attempts: { id: number; status: string; expires_at?: string | null; server_now?: string }[] } }>(`${endpoint}/${active.id}/history`, { signal }).then(response => response.data) : Promise.resolve({ best_score: null, attempts: [] }), [active, endpoint]);
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
  const backToList = () => { setSelected(undefined); setResumeId(undefined); const url = new URL(window.location.href); url.searchParams.delete(kind); url.searchParams.delete("attempt"); url.searchParams.delete("tryout_stage"); url.searchParams.delete("tryout_question"); window.history.replaceState(null, "", url); };
  if (active?.can_access === false) return <div><p role="status">{title} terkunci. Membership program {active.level.toUpperCase()} diperlukan.</p><Link className="button button-primary" href={`/renewal?target=${encodeURIComponent(active.level)}`}>Upgrade Membership</Link><button type="button" onClick={backToList}>Kembali ke Daftar</button></div>;
  if (active) return <div className="sensei-tryout" data-membership={membership}><button className="sensei-back" type="button" onClick={backToList}>Kembali ke Daftar</button>{history.error && <p role="alert">{history.error}</p>}<BackendAssessmentRunner key={`${active.id}-${resumeRevision}`} startActions={resumable ? busy => <div className="tryout-resume-notice"><p>Ada {title} yang masih aktif. Lanjutkan untuk memakai jawaban dan waktu yang tersimpan, atau mulai attempt baru.</p><button className="button button-secondary" type="button" disabled={busy} onClick={resume}>Lanjutkan {title}</button></div> : undefined} path={`${endpoint}/${active.id}/attempts`} domain={kind} title={active.title} resultContext={{ level: active.level, bestScore: history.data?.best_score ?? null }} className="tryout-runner tryout-clean-focus" onComplete={refreshHistory} onBack={backToList} /></div>;
  return <div className="sensei-tryout"><header className="tryout-page-header"><div><h1>{title}</h1><p>Simulasikan ujian sebelum ujian sebenarnya.</p></div></header>{catalog.error && <p role="alert">{catalog.error}<button type="button" onClick={catalog.retry}>Coba Lagi</button></p>}{!catalog.data && !catalog.error && <LoadingSkeleton variant="list" label="Memuat…" />}<section className="tryout-catalog"><div className="tryout-catalog-toolbar"><h2>Simulasi yang tersedia</h2></div><div>{catalog.data?.map((item, index) => <article className="tryout-card" key={item.id}><div className="tryout-card-number">{String(index + 1).padStart(2, "0")}</div><div className="tryout-card-main"><header className="tryout-card-header"><h3>{item.title}</h3><span className="tryout-status-badge status-tersedia">{item.can_access === false ? "TERKUNCI" : "TERSEDIA"} {"\u00b7"} {item.access_type === "free" ? "GRATIS" : "MEMBERSHIP"}</span></header><div className="tryout-card-meta"><span>{item.level.toUpperCase()} {"\u00b7"} {Object.keys(item.sessions).length} sesi{item.published_question_count != null ? ` \u00b7 ${item.published_question_count} soal` : ""}{item.duration_minutes != null ? ` \u00b7 ${item.duration_minutes} menit` : ""}</span></div></div><footer>{item.can_access === false ? <Link className="button button-primary" href={`/renewal?target=${encodeURIComponent(item.level)}`}>Upgrade Membership</Link> : <button className="button button-primary" type="button" onClick={() => { setSelected(item); const url = new URL(window.location.href); url.searchParams.set(kind, String(item.id)); url.searchParams.delete("attempt"); url.searchParams.delete("tryout_stage"); url.searchParams.delete("tryout_question"); window.history.replaceState(null, "", url); }}>Mulai {title}</button>}</footer></article>)}</div></section></div>;
}
