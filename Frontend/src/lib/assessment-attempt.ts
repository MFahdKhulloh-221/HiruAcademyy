import { apiRequest, ApiError } from "./api";

export type AttemptQuestion = { id: number; question?: string; prompt?: string; session?: string; title?: string; options: Record<string, string>; audio_url?: string | null; image_url?: string | null; reading_passage?: string | null; passage?: { title: string; body: string }; correct_option?: string; explanation?: string | null; selected_answer?: string | null; status?: string };
export type AttemptResult = { correct: number; wrong: number; unanswered: number; total?: number; percentage?: number; earned?: number; max?: number; overall_pass?: boolean | null; total_passing_score?: number | null; recommendation_level?: string | null; sessions?: { code: string; label: string; earned: number; max: number; passing_score: number; pass: boolean }[] };
export type ServerAttempt = { id: number; status: "in_progress" | "completed"; revision?: number; current_session?: number; completed_sessions?: string[]; questions: AttemptQuestion[]; answers: Record<string, string>; result: AttemptResult | null; expires_at?: string; started_at?: string };
export const assessmentSessions = ["vocabulary_kanji", "grammar", "reading", "audio"] as const;
export const assessmentSessionLabels = ["Kosakata & Kanji", "Tata Bahasa", "Reading / Dokkai", "Audio / Choukai"] as const;
export type AttemptDomain = "learning" | "tryout" | "placement";
export function chapterAttemptPath(program: number, chapter: number) {
  if (!Number.isSafeInteger(program) || program < 1 || !Number.isSafeInteger(chapter) || chapter < 1) throw new ApiError(404);
  return `/api/student/programs/${program}/chapters/${chapter}/attempts`;
}
export async function readAttempt(path: string, signal?: AbortSignal) {
  return (await apiRequest<{ data: ServerAttempt }>(path, { signal })).data;
}
export async function startAttempt(path: string, body: object = {}) {
  return (await apiRequest<{ data: ServerAttempt }>(path, { method: "POST", body: JSON.stringify(body) })).data;
}
export function currentAnswers(attempt: ServerAttempt, answers: Record<string, string>) {
  const session = assessmentSessions[attempt.current_session ?? 0];
  const ids = new Set(attempt.questions.filter(question => question.session === session).map(question => String(question.id)));
  return Object.fromEntries(Object.entries(answers).filter(([id]) => ids.has(id)));
}
export class AttemptPersistence {
  private queue: Promise<unknown> = Promise.resolve();
  private submitting: Promise<ServerAttempt> | null = null;
  private blocked = false;
  constructor(public attempt: ServerAttempt, private path: string, private domain: AttemptDomain, private request: typeof apiRequest = apiRequest) {}
  private enqueue(action: () => Promise<ServerAttempt>) {
    const task = this.queue.then(action);
    this.queue = task.catch(() => undefined);
    return task;
  }
  private async write(suffix: string, body: object, method: string) {
    try {
      const response = await this.request<{ data: ServerAttempt }>(this.path + suffix, { method, body: JSON.stringify(body) });
      this.attempt = response.data;
      return this.attempt;
    } catch (error) {
      this.blocked = true;
      throw error;
    }
  }
  save(answers: Record<string, string>, finishSession = false) {
    if (this.submitting) return this.submitting;
    const snapshot = { ...answers };
    return this.enqueue(async () => {
      if (this.blocked) throw new ApiError(409);
      if (this.attempt.status === "completed") return this.attempt;
      const body = this.domain === "placement" ? { answers: snapshot } : this.domain === "tryout" ? { answers: currentAnswers(this.attempt, snapshot), revision: this.attempt.revision, finish_session: finishSession } : { answers: snapshot, revision: this.attempt.revision };
      return this.write("/answers", body, "PUT");
    });
  }
  submit(answers: Record<string, string>) {
    if (this.submitting) return this.submitting;
    const snapshot = { ...answers };
    this.submitting = this.enqueue(async () => {
      if (this.blocked) throw new ApiError(409);
      if (this.attempt.status === "completed") return this.attempt;
      const body = this.domain === "placement" ? { answers: snapshot } : this.domain === "tryout" ? { revision: this.attempt.revision } : { answers: snapshot, revision: this.attempt.revision };
      return this.write("/submit", body, "POST");
    });
    return this.submitting;
  }
}
