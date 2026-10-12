import { test, expect } from "@playwright/test";
import { AttemptPersistence, tryOutRemaining, type ServerAttempt } from "../src/lib/assessment-attempt";
import { apiRequest, ApiError } from "../src/lib/api";

test("clock subtracts full request latency, ignores wall clock and retains fixed deadline", () => {
  const attempt = { ...initial(), expires_at: "2026-10-11T00:02:00Z", server_now: "2026-10-11T00:00:00Z", request_started_at: 100, received_at: 2100 };
  expect(tryOutRemaining(attempt, 0)).toBe(118);
  expect(tryOutRemaining(attempt, 5100)).toBe(115);
  expect(tryOutRemaining({ ...attempt, server_now: "2026-10-11T00:00:30Z", request_started_at: 30100, received_at: 32100 }, 35100)).toBe(85);
  expect(tryOutRemaining({ ...attempt, expires_at: null }, 35100)).toBeNull();
});

for (const incomplete of [false, true]) {
  test(`expiry queues behind save, shares manual submit and retries incomplete=${incomplete}`, async () => {
    let server = initial();
    const calls: string[] = [];
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    let expired = false;
    const request: typeof apiRequest = async <T>(path: string) => {
      calls.push(path);
      if (path.endsWith("/answers")) { await paused; }
      else if (expired && !incomplete) server = completed(server);
      return { data: server } as T;
    };
    const flow = new AttemptPersistence(server, "/attempt/9", "tryout", request);
    const save = flow.save({ 1: "A" });
    await expect.poll(() => calls.length).toBe(1);
    expired = true;
    const expiry = flow.expire();
    expect(flow.submit({ 1: "B" })).toBe(expiry);
    release();
    await save;
    if (incomplete) {
      await expect(expiry).rejects.toThrow("backend belum mengonfirmasi hasil selesai");
      expect(flow.attempt.result).toBeNull();
      server = completed(server);
      await expect(flow.expire()).resolves.toMatchObject({ status: "completed" });
    } else await expect(expiry).resolves.toMatchObject({ status: "completed" });
    expect(calls.filter(path => path.endsWith("/answers"))).toHaveLength(1);
    expect(calls.filter(path => path.endsWith("/submit"))).toHaveLength(0);
    expect(flow.attempt.answers).toEqual({});
  });
}

test("expired manual submit skips failed-save guard and late queued saves", async () => {
  const server = { ...initial(), expires_at: "2026-10-11T00:00:00Z", server_now: "2026-10-11T00:00:01Z", request_started_at: performance.now(), received_at: performance.now() };
  const calls: string[] = [];
  const request: typeof apiRequest = async <T>(path: string) => { calls.push(path); return { data: completed(server) } as T; };
  const flow = new AttemptPersistence(server, "/attempt/9", "tryout", request);
  await flow.save({ 1: "A" });
  await flow.submit({ 1: "B" });
  expect(calls).toEqual(["/attempt/9"]);
  expect(flow.attempt.answers).toEqual({});
});

const initial = (): ServerAttempt => ({ id: 9, status: "in_progress", revision: 0, questions: [], answers: {}, result: null });
const completed = (attempt: ServerAttempt): ServerAttempt => ({ ...attempt, status: "completed", result: { correct: 0, wrong: 0, unanswered: 100 } });

test("TryOut submit drains queued late update and uses latest revision without unchanged save", async () => {
  let server = initial();
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let release!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; });
  const request: typeof apiRequest = async <T>(path: string, options: RequestInit = {}) => {
    const body = JSON.parse(String(options.body));
    calls.push({ path, body });
    expect(body.revision).toBe(server.revision);
    if (calls.length === 1) await paused;
    server = path.endsWith("/answers") ? { ...server, answers: body.answers, revision: server.revision! + 1 } : completed(server);
    return { data: server } as T;
  };
  const flow = new AttemptPersistence(server, "/attempt/9", "tryout", request);
  const first = flow.save({ 1: "A" });
  await expect.poll(() => calls.length).toBe(1);
  const late = flow.save({ 1: "B", 2: "C" });
  const sync = flow.save({ 1: "B", 2: "C" });
  release();
  await Promise.all([first, late, sync]);
  const submit = flow.submit({ 1: "B", 2: "C" });
  expect(flow.submit({ 1: "B", 2: "C" })).toBe(submit);
  await expect(submit).resolves.toMatchObject({ status: "completed" });
  expect(calls.map(call => call.path)).toEqual(["/attempt/9/answers", "/attempt/9/answers", "/attempt/9/answers", "/attempt/9/submit"]);
  expect(calls.at(-1)?.body.revision).toBe(3);
  expect(server.answers).toEqual({ 1: "B", 2: "C" });
});

test("TryOut late update after synchronization is still saved before submit", async () => {
  let server = initial();
  const calls: string[] = [];
  const request: typeof apiRequest = async <T>(path: string, options: RequestInit = {}) => {
    calls.push(path);
    const body = JSON.parse(String(options.body));
    expect(body.revision).toBe(server.revision);
    server = path.endsWith("/answers") ? { ...server, answers: body.answers, revision: server.revision! + 1 } : completed(server);
    return { data: server } as T;
  };
  const flow = new AttemptPersistence(server, "/attempt/9", "tryout", request);
  await flow.save({ 1: "A" });
  const late = flow.save({ 1: "B" });
  const submit = flow.submit({ 1: "B" });
  await Promise.all([late, submit]);
  expect(calls).toEqual(["/attempt/9/answers", "/attempt/9/answers", "/attempt/9/submit"]);
  expect(server.answers).toEqual({ 1: "B" });
});

for (const recovered of [false, true]) {
  test(`TryOut ambiguous submit recovery completed=${recovered} never auto-posts again`, async () => {
    let server = initial();
    let posts = 0;
    let saves = 0;
    let reads = 0;
    const request: typeof apiRequest = async <T>(path: string, options: RequestInit = {}) => {
      if (path.endsWith("/answers")) {
        saves++;
        server = { ...server, answers: JSON.parse(String(options.body)).answers, revision: server.revision! + 1 };
      } else if (path.endsWith("/submit")) {
        posts++;
        if (posts === 1) {
          if (recovered) server = completed(server);
          throw new ApiError(500);
        }
        server = completed(server);
      } else reads++;
      return { data: server } as T;
    };
    const flow = new AttemptPersistence(server, "/attempt/9", "tryout", request);
    await flow.save({ 1: "A" });
    if (recovered) await expect(flow.submit({ 1: "A" })).resolves.toMatchObject({ status: "completed" });
    else await expect(flow.submit({ 1: "A" })).rejects.toMatchObject({ status: 500 });
    expect(posts).toBe(1);
    expect(reads).toBe(1);
    expect(saves).toBe(1);
    await expect(flow.submit({ 1: "A" })).resolves.toMatchObject({ status: "completed" });
    expect(posts).toBe(recovered ? 1 : 2);
    expect(saves).toBe(1);
  });
}

test("TryOut failed save blocks submit until successful synchronization", async () => {
  let server = initial();
  let fail = true;
  let posts = 0;
  const request: typeof apiRequest = async <T>(path: string, options: RequestInit = {}) => {
    if (path.endsWith("/answers")) {
      if (fail) throw new ApiError(422, { answers: ["Invalid answer"] });
      server = { ...server, answers: JSON.parse(String(options.body)).answers, revision: 1 };
    } else if (path.endsWith("/submit")) { posts++; server = completed(server); }
    return { data: server } as T;
  };
  const flow = new AttemptPersistence(server, "/attempt/9", "tryout", request);
  await expect(flow.save({ 1: "A" })).rejects.toMatchObject({ status: 422 });
  await expect(flow.submit({ 1: "A" })).rejects.toMatchObject({ status: 422 });
  expect(posts).toBe(0);
  fail = false;
  await flow.save({ 1: "A" });
  await expect(flow.submit({ 1: "A" })).resolves.toMatchObject({ status: "completed" });
  expect(posts).toBe(1);
});

test("TryOut incomplete successful response cannot become completed result", async () => {
  const server = initial();
  const request: typeof apiRequest = async <T>() => ({ data: server }) as T;
  const flow = new AttemptPersistence(server, "/attempt/9", "tryout", request);
  await expect(flow.submit({})).rejects.toThrow("backend belum mengonfirmasi hasil selesai");
  expect(flow.attempt.status).toBe("in_progress");
});

for (const domain of ["learning", "placement"] as const) {
  test(`${domain} submit behavior unchanged`, async () => {
    const calls: string[] = [];
    const request: typeof apiRequest = async <T>(path: string, options: RequestInit = {}) => {
      calls.push(path);
      expect(JSON.parse(String(options.body)).answers).toEqual({ 1: "A" });
      return { data: completed(initial()) } as T;
    };
    await new AttemptPersistence(initial(), "/attempt/9", domain, request).submit({ 1: "A" });
    expect(calls).toEqual(["/attempt/9/submit"]);
  });
}

for (const [status, message, expected] of [
  [401, "secret", "Sesi berakhir"],
  [403, "secret", "Akses Try Out ditolak"],
  [409, "Stale answer revision.", "Revisi jawaban berubah"],
  [409, "Try out attempt is already finished.", "Status attempt berubah"],
  [422, "secret", "Data Try Out tidak valid"],
  [429, "secret", "Terlalu banyak permintaan"],
  [500, "SQLSTATE secret stack trace", "gangguan server"],
] as const) {
  test(`TryOut safe HTTP ${status} feedback ${expected}`, async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
    globalThis.fetch = async () => new Response(JSON.stringify({ message, errors: { answers: ["SQLSTATE secret"], "answers.9000": ["stack trace secret"], revision: ["secret"], finish_session: ["secret"], password_dump: ["secret"] } }), { status });
    try {
      await apiRequest("/api/student/try-outs/2/attempts/9").then(() => { throw new Error("Expected failure"); }, error => {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(status);
        expect(error.message).toContain(`HTTP ${status}`);
        expect(error.message).toContain(expected);
        expect(JSON.stringify(error.errors) + error.message).not.toMatch(/SQLSTATE|secret|stack trace/);
        if (status === 422) {
          expect(Object.keys(error.errors)).toEqual(["answers", "answers.9000", "revision", "finish_session"]);
          expect(error.message).toContain("ID soal dan pilihan A–D");
          expect(error.message.length).toBeLessThan(600);
        }
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = originalUrl;
    }
  });
}
