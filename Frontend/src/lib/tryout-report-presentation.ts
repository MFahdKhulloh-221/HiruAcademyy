import type { ReportQuestion } from "./admin-tryout-results-api";

export const reportNumber = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);
export const questionKey = (question: ReportQuestion) => `${question.id}:${question.fingerprint}`;
export const reportPlainText = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
export function formLetter(index: number): string { return (index >= 26 ? formLetter(Math.floor(index / 26) - 1) : "") + String.fromCharCode(65 + index % 26); }
export function groupReportQuestions(questions: ReportQuestion[]) {
  const groups = new Map<number, ReportQuestion[]>();
  for (const question of questions) groups.set(question.id, [...(groups.get(question.id) ?? []), question]);
  return [...groups.values()].map(forms => forms.sort((a, b) => a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0));
}

/** Exact numeric scores use disjoint half-open buckets; pre-bucketed API labels stay intact. */
export function reportHistogram(rows: { label: string; count: number }[]) {
  if (!rows.length) return { buckets: rows, observed: false };
  const numeric = rows.map(row => ({ score: Number(row.label), count: row.count }));
  if (rows.some(row => !row.label.trim()) || numeric.some(row => !Number.isFinite(row.score))) return { buckets: rows, observed: false };
  const min = Math.min(...numeric.map(row => row.score));
  const max = Math.max(...numeric.map(row => row.score));
  if (min === max) return { buckets: [{ label: reportNumber(min), count: numeric.reduce((sum, row) => sum + row.count, 0) }], observed: true };
  const origin = Math.floor(min);
  const width = Math.max(1, Math.ceil((Math.ceil(max) - origin) / 6));
  const size = Math.max(1, Math.min(6, Math.ceil((max - origin) / width)));
  const buckets = Array.from({ length: size }, (_, index) => ({ label: `${reportNumber(origin + width * index)}–${index === size - 1 ? "" : "<"}${reportNumber(origin + width * (index + 1))}`, count: 0 }));
  for (const row of numeric) buckets[Math.min(size - 1, Math.floor((row.score - origin) / width))].count += row.count;
  return { buckets, observed: true };
}
