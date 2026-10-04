import { test, expect } from "@playwright/test";
import { AttemptPersistence, currentAnswers, type ServerAttempt } from "../src/lib/assessment-attempt";
import { apiRequest } from "../src/lib/api";

const attempt = (): ServerAttempt => ({ id: 1, status: "in_progress", revision: 0, questions: [{ id: 1, question: "Question", options: { A: "First", B: "Second", C: "Third", D: "Fourth" } }], answers: {}, result: null });

test("autosave revisions serialize before one manual/automatic submission", async () => {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let server = attempt();
  const request = (async (path: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    calls.push({ path, body });
    expect(body.revision).toBe(server.revision);
    server = { ...server, revision: server.revision! + 1, answers: body.answers, status: path.endsWith("/submit") ? "completed" : "in_progress" };
    return { data: server };
  }) as typeof apiRequest;
  const store = new AttemptPersistence(attempt(), "/attempts/1", "learning", request);
  const first = store.save({ "1": "A" });
  const second = store.save({ "1": "B" });
  const manual = store.submit({ "1": "B" });
  const automatic = store.submit({ "1": "B" });
  expect(manual).toBe(automatic);
  await Promise.all([first, second, manual, automatic]);
  expect(calls.map(call => call.path)).toEqual(["/attempts/1/answers", "/attempts/1/answers", "/attempts/1/submit"]);
  expect(server.answers).toEqual({ "1": "B" });
});

test("failed stale save blocks grading submission", async () => {
  let requests = 0;
  const request = (async () => { requests++; throw new Error("409"); }) as typeof apiRequest;
  const store = new AttemptPersistence(attempt(), "/attempts/1", "learning", request);
  await expect(store.save({ "1": "A" })).rejects.toThrow("409");
  await expect(store.submit({ "1": "A" })).rejects.toThrow();
  expect(requests).toBe(1);
});

test("tryout sends only current canonical session answers", () => {
  const state = { ...attempt(), current_session: 1, questions: [{ id: 1, session: "vocabulary_kanji", options: {} }, { id: 2, session: "grammar", options: {} }] };
  expect(currentAnswers(state, { "1": "A", "2": "B" })).toEqual({ "2": "B" });
});
