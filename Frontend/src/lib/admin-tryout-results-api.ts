import { apiDownload, apiRequest } from "@/lib/api";

export type ReportFilters = { search: string; status: "all" | "passed" | "failed"; date_from: string; date_to: string };
export type ReportParticipant = { id: number; user_id: number; name: string; whatsapp: string | null; started_at: string; completed_at: string; status: string; raw_score: number; final_score: number; max_score: number; overall_pass: boolean; sessions: { code: string; label: string; earned: number; max: number; correct: number; wrong: number; unanswered: number; pass: boolean }[] };
export type ReportQuestion = { version: string; id: number; fingerprint: string; section: string; number: number; question: string; options: Record<string, string>; correct_option: string; received: number; not_received: number; correct: number; wrong: number; unanswered: number; correct_percentage: number | null; distribution: Record<string, { count: number; percentage: number }> };
export type ReportOverview = { try_out: { id: number; title: string; level: string }; summary: { responses: number; unique_participants: number; mean: number | null; median: number | null; min: number | null; max: number | null; passed: number; failed: number }; histogram: { label: string; count: number }[]; questions: ReportQuestion[]; hardest: ReportQuestion[] };
export type ReportParticipants = { data: ReportParticipant[]; meta: { current_page: number; last_page: number; total: number; per_page: number } };
export type ReportAttempt = { participant: ReportParticipant; try_out: ReportOverview["try_out"]; questions: { id: number; number: number; session: string; question: string; options: Record<string, string>; reading_passage?: string | null; passage?: { body?: string; title?: string } | null; answer: string | null; correct_option: string; explanation: string | null; point_value: number; earned: number; outcome: string }[]; attempts: { id: number; started_at: string; completed_at: string; raw_score: number }[] };

export function reportQuery(filters: ReportFilters, page?: number) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
  if (page !== undefined) { query.set("page", String(page)); query.set("per_page", "20"); }
  return query.toString();
}
function base(id: string) { return `/api/admin/try-outs/${encodeURIComponent(id)}/reports`; }
export async function loadReport(id: string, filters: ReportFilters, signal: AbortSignal) { return (await apiRequest<{ data: ReportOverview }>(`${base(id)}?${reportQuery(filters)}`, { signal })).data; }
export async function loadReportParticipants(id: string, filters: ReportFilters, page: number, signal: AbortSignal) { return apiRequest<ReportParticipants>(`${base(id)}/participants?${reportQuery(filters, page)}`, { signal }); }
export async function loadReportAttempt(id: string, attempt: number, filters: ReportFilters, signal: AbortSignal) { return (await apiRequest<{ data: ReportAttempt }>(`${base(id)}/attempts/${attempt}?${reportQuery(filters)}`, { signal })).data; }
export function downloadReport(id: string, filters: ReportFilters, signal: AbortSignal) { return apiDownload(`${base(id)}/export.xlsx?${reportQuery(filters)}`, signal); }
