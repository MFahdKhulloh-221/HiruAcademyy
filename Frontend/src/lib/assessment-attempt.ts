import { apiRequest, ApiError } from "./api";

export type AttemptQuestion = { id: number; instruction?: string | null; japanese?: { text: string; reading?: string | null } | null; question?: string; prompt?: string; session?: string | number; part?: number; duration_minutes?: number; title?: string; options: Record<string, string>; audio_url?: string | null; audio_url_resolved_url?: string | null; image_url?: string | null; reading_passage?: string | null; passage?: { title: string; body: string }; correct_option?: string; explanation?: string | null; selected_answer?: string | null; status?: string };
export type AttemptResult = { correct: number; wrong: number; unanswered: number; total?: number; percentage?: number; earned?: number; max?: number; passed?: boolean; passing_score?: number; overall_pass?: boolean | null; total_passing_score?: number | null; recommendation_level?: string | null; sessions?: { code: string; label: string; earned: number; max: number; correct: number; wrong: number; unanswered: number; passing_score: number; passing_score_basis?: "points" | "correct_answers"; pass: boolean }[] };
export type MiniQuestion = AttemptQuestion & { session: number; part: number; duration_minutes: number };
export type ServerAttempt = { adaptive?: boolean; question_limit?: number; passing_score?: number; request_started_at?: number; received_at?: number; session?: number; part?: number; duration_minutes?: number; server_now?: string; kind?: string; chapter_id?: number; id: number; status: "in_progress" | "completed"; revision?: number; scoring_version?: string; current_session?: number; completed_sessions?: string[]; questions: AttemptQuestion[]; answers: Record<string, string>; result: AttemptResult | null; expires_at?: string | null; started_at?: string; completed_at?: string | null };
export const assessmentSessions = ["vocabulary_kanji", "grammar", "reading", "audio"] as const;
export const assessmentSessionLabels = ["Kosakata & Kanji", "Tata Bahasa", "Reading (Dokkai)", "Audio (Choukai)"] as const;
export type AttemptDomain = "learning" | "tryout" | "placement";
export function chapterAttemptPath(program: number, chapter: number) {
  if (!Number.isSafeInteger(program) || program < 1 || !Number.isSafeInteger(chapter) || chapter < 1) throw new ApiError(404);
  return `/api/student/programs/${program}/chapters/${chapter}/attempts`;
}
export async function readAttempt(path: string, signal?: AbortSignal) {
  const request_started_at = performance.now();
  const attempt = (await apiRequest<{ data: ServerAttempt }>(path, { signal })).data;
  return { ...attempt, request_started_at, received_at: performance.now() };
}
export async function startAttempt(path: string, body: object = {}) {
  const request_started_at = performance.now();
  const attempt = (await apiRequest<{ data: ServerAttempt }>(path, { method: "POST", body: JSON.stringify(body) })).data;
  return { ...attempt, request_started_at, received_at: performance.now() };
}
export function currentAnswers(attempt: ServerAttempt, answers: Record<string, string>) {
  const session = assessmentSessions[attempt.current_session ?? 0];
  const ids = new Set(attempt.questions.filter(question => question.session === session).map(question => String(question.id)));
  return Object.fromEntries(Object.entries(answers).filter(([id]) => ids.has(id)));
}
export function tryOutRemaining(attempt: ServerAttempt, now: number) {
  if (!attempt.expires_at || !attempt.server_now || attempt.request_started_at === undefined || attempt.received_at === undefined) return null;
  return Math.max(0, Math.ceil((Date.parse(attempt.expires_at) - Date.parse(attempt.server_now) - Math.max(0, Math.max(now, attempt.received_at) - attempt.request_started_at)) / 1000));
}
export class AttemptPersistence {
  private queue: Promise<unknown> = Promise.resolve();
  private submitting: Promise<ServerAttempt> | null = null;
  private saveError: unknown;
  private expiring = false;
  private expired() { return this.domain === "tryout" && (this.expiring || tryOutRemaining(this.attempt, performance.now()) === 0); }
  private async refresh() {
    const request_started_at = performance.now();
    const response = await this.request<{ data: ServerAttempt }>(this.path);
    this.attempt = { ...response.data, request_started_at, received_at: performance.now() };
    return this.attempt;
  }
  expire() {
    this.expiring = true;
    if (this.submitting) return this.submitting;
    this.submitting = this.enqueue(async () => {
      const attempt = await this.refresh();
      if (attempt.status !== "completed" || !attempt.result) throw new ApiError(200, {}, "Try Out: backend belum mengonfirmasi hasil selesai. Coba kembali untuk memeriksa attempt yang sama.");
      return attempt;
    }).finally(() => { this.submitting = null; });
    return this.submitting;
  }
  constructor(public attempt: ServerAttempt, private path: string, private domain: AttemptDomain, private request: typeof apiRequest = apiRequest) {}
  private enqueue(action: () => Promise<ServerAttempt>) {
    const task = this.queue.then(action);
    this.queue = task.catch(() => undefined);
    return task;
  }
  private async write(suffix: string, body: object, method: string) {
    const request_started_at = performance.now();
    const response = await this.request<{ data: ServerAttempt }>(this.path + suffix, { method, body: JSON.stringify(body) });
    if (this.domain === "tryout" && suffix === "/submit" && (response.data.status !== "completed" || !response.data.result)) throw new ApiError(200, {}, "Try Out: backend belum mengonfirmasi hasil selesai. Coba kembali untuk memeriksa attempt yang sama.");
    this.attempt = { ...response.data, request_started_at, received_at: performance.now() };
    return this.attempt;
  }
  save(answers: Record<string, string>, finishSession = false) {
    if (this.submitting) return this.submitting;
    const snapshot = { ...answers };
    return this.enqueue(async () => {
      if (this.attempt.status === "completed") return this.attempt;
      if (this.expired()) return this.refresh();
      const body = this.domain === "placement" ? { answers: snapshot, ...((this.attempt.adaptive || this.attempt.scoring_version === "percentage-v1") ? { revision: this.attempt.revision } : {}) } : this.domain === "tryout" ? { answers: snapshot, revision: this.attempt.revision, finish_session: finishSession } : { answers: snapshot, revision: this.attempt.revision };
      try {
        const attempt = await this.write("/answers", body, "PUT");
        this.saveError = undefined;
        return attempt;
      } catch (error) {
        if (this.domain === "placement" && (this.attempt.adaptive || this.attempt.scoring_version === "percentage-v1")) {
          try {
            const canonical = await this.refresh();
            if (canonical.status === "completed" || Object.entries(snapshot).every(([id, answer]) => canonical.answers[id] === answer)) {
              this.saveError = undefined;
              return canonical;
            }
          } catch { /* Preserve original save error; never replay an unconfirmed answer. */ }
        }
        this.saveError = error;
        throw error;
      }
    });
  }
  submit(answers: Record<string, string>) {
    if (this.submitting) return this.submitting;
    const snapshot = { ...answers };
    this.submitting = this.enqueue(async () => {
      if (this.attempt.status === "completed") return this.attempt;
      if (this.expired()) {
        const attempt = await this.refresh();
        if (attempt.status !== "completed" || !attempt.result) throw new ApiError(200, {}, "Try Out: backend belum mengonfirmasi hasil selesai. Coba kembali untuk memeriksa attempt yang sama.");
        return attempt;
      }
      if (this.saveError && this.attempt.kind !== "mini") throw this.saveError;
      if (this.domain === "tryout" && (Object.keys(snapshot).length !== Object.keys(this.attempt.answers).length || Object.entries(snapshot).some(([id, answer]) => this.attempt.answers[id] !== answer))) {
        const saved = await this.write("/answers", { answers: snapshot, revision: this.attempt.revision }, "PUT");
        if (saved.status === "completed") return saved;
      }
      const body = this.domain === "placement" ? { answers: snapshot, ...((this.attempt.adaptive || this.attempt.scoring_version === "percentage-v1") ? { revision: this.attempt.revision } : {}) } : this.domain === "tryout" ? { revision: this.attempt.revision } : { answers: snapshot, revision: this.attempt.revision };
      return this.write("/submit", body, "POST");
    }).catch(async error => {
      if (this.domain !== "tryout" && this.attempt.kind !== "mini") { this.submitting = null; throw error; }
      try {
        const request_started_at = performance.now();
        const response = await this.request<{ data: ServerAttempt }>(this.path);
        this.attempt = { ...response.data, request_started_at, received_at: performance.now() };
        if (this.attempt.status === "completed" && (this.domain !== "tryout" || this.attempt.result)) return this.attempt;
      } catch {
        throw error;
      } finally {
        this.submitting = null;
      }
      throw error;
    });
    return this.submitting;
  }
}
