import { apiRequest, ApiError } from "./api";
import type { ServerAttempt } from "./assessment-attempt";

export const dailyPracticeCategories = { vocabulary: "Kosakata dan Kanji", grammar: "Tata Bahasa", reading: "Reading", audio: "Audio" } as const;
export type DailyPractice = {
  id: number; title: string; category: keyof typeof dailyPracticeCategories; target_level: string;
  starts_at: string; ends_at: string; question_count: number;
  status: "upcoming" | "open" | "in_progress" | "completed" | "closed";
  can_review?: boolean;
};
export type DailyPracticeAttempt = ServerAttempt & { revision: number; daily_practice_id: number };
const base = "/api/student/daily-practices";
function path(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(404);
  return `${base}/${id}`;
}
export function wibDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export async function dailyPractices(date: string, signal?: AbortSignal) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(422);
  return (await apiRequest<{ data: DailyPractice[] }>(`${base}?date=${date}`, { signal })).data;
}
export async function dailyPractice(id: number, signal?: AbortSignal) {
  return (await apiRequest<{ data: DailyPractice }>(path(id), { signal })).data;
}
export async function dailyPracticeAttempt(id: number, start = false, signal?: AbortSignal) {
  return (await apiRequest<{ data: DailyPracticeAttempt }>(`${path(id)}/attempt`, start ? { method: "POST", body: "{}", signal } : { signal })).data;
}
export async function dailyPracticeReview(id: number) {
  return (await apiRequest<{ data: DailyPracticeAttempt }>(`${path(id)}/review`)).data;
}
export function sameDailyAnswers(left: Record<string, string>, right: Record<string, string>) {
  return Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([id, answer]) => right[id] === answer);
}

// One queue per attempt: failed saves block submission; retry requires explicit student action.
export class DailyPracticePersistence {
  private queue: Promise<unknown> = Promise.resolve();
  private failure: unknown;
  private submitting: Promise<DailyPracticeAttempt> | null = null;
  constructor(public attempt: DailyPracticeAttempt, private request = apiRequest) {}
  private enqueue(action: () => Promise<DailyPracticeAttempt>) {
    const task = this.queue.then(action);
    this.queue = task.catch(() => undefined);
    return task;
  }
  private async write(suffix: string, body: object, method: string) {
    const response = await this.request<{ data: DailyPracticeAttempt }>(`${path(this.attempt.daily_practice_id)}${suffix}`, { method, body: JSON.stringify(body) });
    this.attempt = response.data;
    return this.attempt;
  }
  private async persist(snapshot: Record<string, string>, retry: boolean) {
    if (this.failure && !retry) throw this.failure;
    if (this.attempt.status === "completed") return this.attempt;
    try {
      if (!sameDailyAnswers(snapshot, this.attempt.answers)) await this.write("/answers", { answers: snapshot, revision: this.attempt.revision }, "PUT");
      this.failure = undefined;
      return this.attempt;
    } catch (error) {
      // Recover uncertain writes without replaying stale answers or losing local edits.
      try {
        const canonical = (await this.request<{ data: DailyPracticeAttempt }>(`${path(this.attempt.daily_practice_id)}/attempt`)).data;
        this.attempt = canonical;
        if (canonical.status === "completed" || sameDailyAnswers(snapshot, canonical.answers)) {
          this.failure = undefined;
          return canonical;
        }
      } catch { /* Keep original error and unsaved snapshot in caller. */ }
      this.failure = error;
      throw error;
    }
  }
  save(answers: Record<string, string>, retry = false) {
    const snapshot = { ...answers };
    return this.enqueue(() => this.persist(snapshot, retry));
  }
  submit(answers: Record<string, string>) {
    if (this.submitting) return this.submitting;
    const snapshot = { ...answers };
    this.submitting = this.enqueue(async () => {
      await this.persist(snapshot, false);
      if (this.attempt.status === "completed") return this.attempt;
      const result = await this.write("/submit", { revision: this.attempt.revision }, "POST");
      if (result.status !== "completed" || !result.result) throw new ApiError(200, {}, "Hasil belum dikonfirmasi server. Coba lagi pada attempt yang sama.");
      return result;
    }).finally(() => { this.submitting = null; });
    return this.submitting;
  }
}
