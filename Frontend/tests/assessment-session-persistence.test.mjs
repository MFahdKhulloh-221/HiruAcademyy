import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

class ApiError extends Error {
  constructor(status) { super(String(status)); this.status = status; }
}
const context = vm.createContext({ exports: {}, performance, require: () => ({ ApiError }) });
vm.runInContext(ts.transpileModule(readFileSync(new URL("../src/lib/assessment-attempt.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { AttemptPersistence } = context.exports;
const initial = () => ({ id: 1, status: "in_progress", revision: 0, timing_mode: "per_session", phase: "session", current_session: 0, active_sessions: ["vocabulary_kanji", "grammar"], session_duration_minutes: { vocabulary_kanji: 10, grammar: 20, reading: 20, audio: 10 }, break_duration_minutes: 5, questions: [{ id: 1, session: "vocabulary_kanji", options: {} }, { id: 2, session: "grammar", options: {} }], answers: {}, result: null });
function backend(state = initial()) {
  const calls = [];
  return {
    calls,
    get state() { return state; },
    set state(value) { state = value; },
    request: async (path, options) => {
      const body = options ? JSON.parse(options.body) : null;
      calls.push({ path, body });
      if (body) {
        assert.equal(body.revision, state.revision);
        if (path.endsWith("/next-session")) state = { ...state, revision: state.revision + 1, phase: "session", expires_at: "2099-01-01T00:00:00Z", server_now: "2026-01-01T00:00:00Z" };
        else {
          assert.ok(path.endsWith("/answers"), "per-session never uses global submit");
          assert.equal(state.phase, "session");
          const id = state.current_session === 0 ? "1" : "2";
          assert.deepEqual(Object.keys(body.answers), [id]);
          state = { ...state, revision: state.revision + 1, answers: { ...state.answers, ...body.answers }, ...(body.finish_session ? { phase: "break", current_session: state.current_session + 1, expires_at: null, break_ends_at: "2026-01-01T00:05:00Z" } : {}) };
        }
      }
      return { data: state };
    },
  };
}

test("queued finish drops stale autosave and next-session uses canonical revision", async () => {
  const api = backend();
  const store = new AttemptPersistence(api.state, "/attempts/1", "tryout", api.request);
  const finish = store.save({ 1: "A", 2: "B" }, true);
  const next = store.nextSession();
  const stale = store.save({ 1: "C", 2: "D" });
  await Promise.all([finish, next, stale]);
  assert.deepEqual(api.calls.map(call => call.path), ["/attempts/1/answers", "/attempts/1/next-session"]);
  assert.deepEqual(api.state.answers, { 1: "A" });
  await store.save({ 1: "C", 2: "B" });
  assert.deepEqual(api.calls.at(-1).body.answers, { 2: "B" });
});

test("manual and automatic submit share current-session finish; next session remains writable", async () => {
  const api = backend();
  const store = new AttemptPersistence(api.state, "/attempts/1", "tryout", api.request);
  const manual = store.submit({ 1: "A", 2: "B" });
  assert.equal(manual, store.submit({ 1: "C" }));
  assert.equal(manual, store.save({ 1: "D" }));
  await manual;
  assert.equal(api.calls[0].body.finish_session, true);
  assert.equal(store.attempt.phase, "break");
  assert.equal(store.attempt.current_session, 1);
  await store.nextSession();
  assert.equal(store.attempt.current_session, 1);
  await store.submit({ 1: "C", 2: "B" });
  assert.deepEqual(api.calls.at(-1).body.answers, { 2: "B" });
});

test("expiry accepts canonical break without result and clears expiring before next session", async () => {
  const api = backend();
  const store = new AttemptPersistence(api.state, "/attempts/1", "tryout", api.request);
  api.state = { ...api.state, revision: 1, phase: "break", current_session: 1, expires_at: null };
  await store.expire();
  assert.equal(store.attempt.result, null);
  await store.nextSession();
  await store.save({ 1: "A", 2: "B" });
  assert.equal(api.calls.at(-1).path, "/attempts/1/answers");
});

test("deadline autosave refreshes break; late rejected autosave adopts canonical closed state", async () => {
  for (const expired of [false, true]) {
    const api = backend();
    const state = { ...api.state, ...(expired ? { expires_at: "2026-01-01T00:00:00Z", server_now: "2026-01-01T00:00:00Z", request_started_at: performance.now(), received_at: performance.now() } : {}) };
    api.state = { ...api.state, revision: 1, phase: "break", current_session: 1, expires_at: null };
    let writes = 0;
    const store = new AttemptPersistence(state, "/attempts/1", "tryout", async (path, options) => {
      if (options) { writes++; throw new ApiError(409); }
      return api.request(path);
    });
    assert.equal((await store.save({ 1: "A", 2: "B" })).phase, "break");
    await store.save({ 1: "C" });
    assert.equal(writes, expired ? 0 : 1);
  }
});

test("lost next-session response refreshes canonical deadline without reposting or resetting timer", async () => {
  const api = backend({ ...initial(), phase: "break", current_session: 1, expires_at: null });
  let posts = 0;
  const store = new AttemptPersistence(api.state, "/attempts/1", "tryout", async (path, options) => {
    const response = await api.request(path, options);
    if (options) { posts++; throw new Error("lost response"); }
    return response;
  });
  await store.nextSession();
  const deadline = store.attempt.expires_at;
  await store.nextSession();
  assert.equal(posts, 1);
  assert.equal(store.attempt.expires_at, deadline);
  assert.equal(store.attempt.current_session, 1);
});

test("invalid answer errors remain errors even if another tab closed session", async () => {
  const api = backend();
  const store = new AttemptPersistence(api.state, "/attempts/1", "tryout", async (_path, options) => {
    if (options) throw new ApiError(422);
    return { data: { ...api.state, phase: "break", current_session: 1 } };
  });
  await assert.rejects(store.save({ 1: "invalid" }), /422/);
  assert.equal(store.attempt.phase, "session");
});

test("shared grammar-reading timer saves both categories and drops autosave queued after finish", async () => {
  const state = { ...initial(), current_session: 1, session_duration_minutes: { vocabulary_kanji: 30, grammar_reading: 60, audio: 30 }, questions: [{ id: 2, session: "grammar" }, { id: 3, session: "reading" }, { id: 4, session: "audio" }] };
  const calls = [];
  const store = new AttemptPersistence(state, "/attempts/1", "tryout", async (path, options) => {
    const body = JSON.parse(options.body);
    calls.push({ path, body });
    assert.deepEqual(body.answers, { 2: "A", 3: "B" });
    return { data: { ...state, answers: body.answers, revision: 1, current_session: 2, phase: "break", expires_at: null } };
  });
  await Promise.all([store.save({ 2: "A", 3: "B", 4: "C" }, true), store.save({ 2: "D", 3: "D" })]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.finish_session, true);
  assert.equal(store.attempt.phase, "break");
});

test("break expiry adopts server-started session once and leaves answers writable", async () => {
  const api = backend({ ...initial(), phase: "break", current_session: 1, expires_at: null });
  const store = new AttemptPersistence(api.state, "/attempts/1", "tryout", api.request);
  api.state = { ...api.state, phase: "session", expires_at: "2099-01-01T00:00:00Z", server_now: "2026-01-01T00:00:00Z" };
  const first = store.expire();
  assert.equal(first, store.expire());
  assert.equal((await first).phase, "session");
  assert.equal(api.calls.length, 1);
  await store.save({ 2: "B" });
  assert.equal(api.calls.at(-1).path, "/attempts/1/answers");
});

test("last timeout locks review; concurrent result clicks finalize once without writing answers", async () => {
  const state = { ...initial(), phase: "session", current_session: 3 };
  let canonical = { ...state, phase: "review", current_session: 4, expires_at: null };
  const calls = [];
  const store = new AttemptPersistence(state, "/attempts/1", "tryout", async (path, options) => {
    calls.push(path);
    if (options) {
      assert.equal(path, "/attempts/1/submit");
      assert.deepEqual(Object.keys(JSON.parse(options.body)), ["revision"]);
      canonical = { ...canonical, status: "completed", result: { correct: 1 } };
    }
    return { data: canonical };
  });
  assert.equal((await store.expire()).phase, "review");
  await store.save({ 1: "D" });
  const submit = store.submit({ 1: "D" });
  assert.equal(submit, store.submit({ 1: "C" }));
  assert.equal((await submit).status, "completed");
  assert.deepEqual(calls, ["/attempts/1", "/attempts/1/submit"]);
});

test("checkpoint and legacy tryout keep global submission and unfiltered answers", async () => {
  for (const domain of ["checkpoint", "tryout"]) {
    const state = initial();
    delete state.timing_mode;
    const calls = [];
    const store = new AttemptPersistence(state, "/attempts/1", domain, async (path, options) => {
      const body = JSON.parse(options.body);
      calls.push({ path, body });
      return { data: path.endsWith("/submit") ? { ...state, status: "completed", result: { correct: 1, wrong: 0, unanswered: 1 } } : { ...state, answers: body.answers, revision: 1 } };
    });
    await store.submit({ 1: "A", 2: "B" });
    assert.deepEqual(calls[0].body.answers, { 1: "A", 2: "B" });
    assert.equal(calls[1].path, "/attempts/1/submit");
  }
});
