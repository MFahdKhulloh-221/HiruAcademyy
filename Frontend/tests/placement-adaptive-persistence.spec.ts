import { test, expect } from "@playwright/test";
import { AttemptPersistence, type ServerAttempt } from "../src/lib/assessment-attempt";
import { apiRequest, ApiError } from "../src/lib/api";

test("adaptive placement serializes revision and duplicate submission", async () => {
  let server: ServerAttempt = { id: 1, adaptive: true, question_limit: 12, revision: 0, status: "in_progress", questions: [], answers: {}, result: null };
  const calls: string[] = [];
  const request = (async (path: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    expect(body.revision).toBe(server.revision);
    calls.push(path);
    server = { ...server, revision: server.revision! + 1, answers: body.answers, status: path.endsWith("/submit") ? "completed" : "in_progress" };
    return { data: server };
  }) as typeof apiRequest;
  const persistence = new AttemptPersistence(server, "/placement/1", "placement", request);
  const save = persistence.save({ "1": "A" });
  const manual = persistence.submit({ "1": "A" });
  expect(persistence.submit({ "1": "A" })).toBe(manual);
  await Promise.all([save, manual]);
  expect(calls).toEqual(["/placement/1/answers", "/placement/1/submit"]);
});

test("legacy placement keeps revision-free contract", async () => {
  const server: ServerAttempt = { id: 1, status: "in_progress", questions: [], answers: {}, result: null };
  const request = (async (_path: string, options: RequestInit) => {
    expect(JSON.parse(String(options.body))).toEqual({ answers: {} });
    return { data: server };
  }) as typeof apiRequest;
  await new AttemptPersistence(server, "/placement/1", "placement", request).save({});
});

test("adaptive placement preserves canonical timeout completion", async () => {
  const server: ServerAttempt = { id: 1, adaptive: true, revision: 2, status: "in_progress", questions: [], answers: { "1": "A" }, result: null };
  const completed: ServerAttempt = { ...server, status: "completed", result: { correct: 1, wrong: 0, unanswered: 11, recommendation_level: "N5" } };
  let calls = 0;
  const request = (async () => { calls++; return { data: completed }; }) as typeof apiRequest;
  const persistence = new AttemptPersistence(server, "/placement/1", "placement", request);
  expect(await persistence.save({ "1": "A", "2": "B" })).toMatchObject(completed);
  expect(await persistence.submit({ "1": "A", "2": "B" })).toMatchObject(completed);
  expect(calls).toBe(1);
});

test("lost adaptive save response reconciles committed answer without replay", async () => {
  const initial: ServerAttempt = { id: 1, adaptive: true, revision: 0, status: "in_progress", questions: [], answers: {}, result: null };
  const canonical = { ...initial, revision: 1, answers: { "1": "A" } };
  const calls: string[] = [];
  const request = (async (path: string, options?: RequestInit) => {
    calls.push(path);
    if (path.endsWith("/answers")) throw new TypeError("Response lost after commit");
    if (path.endsWith("/submit")) expect(JSON.parse(String(options?.body)).revision).toBe(1);
    return { data: canonical };
  }) as typeof apiRequest;
  const persistence = new AttemptPersistence(initial, "/placement/1", "placement", request);
  expect(await persistence.save({ "1": "A" })).toMatchObject(canonical);
  await persistence.submit({ "1": "A" });
  expect(calls).toEqual(["/placement/1/answers", "/placement/1", "/placement/1/submit"]);
});

test("conflicting canonical answer stays rejected without overwrite", async () => {
  const initial: ServerAttempt = { id: 1, adaptive: true, revision: 0, status: "in_progress", questions: [], answers: {}, result: null };
  let writes = 0;
  const request = (async (path: string) => {
    if (path.endsWith("/answers")) { writes++; throw new ApiError(409); }
    return { data: { ...initial, revision: 1, answers: { "1": "B" } } };
  }) as typeof apiRequest;
  const persistence = new AttemptPersistence(initial, "/placement/1", "placement", request);
  await expect(persistence.save({ "1": "A" })).rejects.toMatchObject({ status: 409 });
  await expect(persistence.submit({ "1": "A" })).rejects.toMatchObject({ status: 409 });
  expect(persistence.attempt.answers).toEqual({ "1": "B" });
  expect(writes).toBe(1);
});
