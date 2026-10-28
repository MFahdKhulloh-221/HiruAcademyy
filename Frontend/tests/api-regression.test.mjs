import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(cookie = "") {
  const calls = [];
  const document = { cookie };
  const context = vm.createContext({
    exports: {}, document, window: { dispatchEvent() {} },
    process: { env: { NEXT_PUBLIC_API_URL: "http://localhost:8000" } },
    Headers, DOMException, AbortController, Event, structuredClone,
    URL, fetch: (url, options) => new Promise((resolve, reject) => {
      const call = { url, options, resolve: (data, status = 200) => resolve(new Response(status === 204 ? null : JSON.stringify(data), { status })), reject };
      calls.push(call);
      options.signal?.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }),
  });
  vm.runInContext(source, context);
  return { ...context.exports, calls, document };
}

function learningHarness(data) {
  const calls = [];
  const context = vm.createContext({ exports: {}, require: () => ({ apiRequest: async (path, options) => { calls.push({ path, options }); return { data }; } }) });
  const learning = ts.transpileModule(readFileSync(new URL("../src/lib/learning-api.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(learning, context);
  return { ...context.exports, calls };
}

test("learning catalog preserves student programs and entitlements without public catalog reads", async () => {
  const programs = [
    { id: 5, code: "n5", name: "Active N5", family: "jlpt" },
    { id: 4, code: "n4", name: "Entitled inactive N4", family: "jlpt" },
  ];
  const access = { learning: { n5: "preview", n4: "full" }, source_grants: [{ plan_code: "lms", program_code: "n4" }], replay_levels: [] };
  const api = learningHarness({ programs, access });
  const signal = new AbortController().signal;
  const catalog = await api.learningCatalog(signal);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].path, "/api/student/dashboard");
  assert.equal(api.calls[0].options.signal, signal);
  assert.equal(catalog.programs, programs);
  assert.equal(catalog.access, access);
  const empty = learningHarness({ programs: [], access });
  assert.equal((await empty.learningCatalog()).programs.length, 0);
});

test("replay catalog resolves owned inactive programs through student dashboard", async () => {
  const programs = [{ id: 4, code: "n4", name: "Entitled inactive N4", family: "jlpt" }];
  const access = { learning: { n4: "full" }, source_grants: [], replay_levels: ["n4"] };
  const learning = learningHarness({ programs, access });
  const playlists = [{ id: 9, program_id: 4, title: "Owned replay" }];
  const calls = [];
  const context = vm.createContext({ exports: {}, require: path => path === "@/lib/learning-api" ? learning : {
    apiRequest: async (path, options) => { calls.push({ path, options }); return { data: playlists }; },
  } });
  const source = ts.transpileModule(readFileSync(new URL("../src/lib/schedule-replay-api.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(source, context);
  const signal = new AbortController().signal;
  const result = await context.exports.studentReplays(signal);
  assert.equal(result.playlists, playlists);
  assert.equal(result.programs.find(program => program.id === playlists[0].program_id)?.code, "n4");
  assert.equal(result.access, access);
  assert.deepEqual(calls.map(call => call.path), ["/api/student/replays"]);
  assert.equal(calls[0].options.signal, signal);
  assert.deepEqual(learning.calls.map(call => call.path), ["/api/student/dashboard"]);
  assert.equal(learning.calls[0].options.signal, signal);
});

test("dashboard aggregate preserves canonical order, next chapter, weighted progress and module total without fanout", async () => {
  const programs = [{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }, { id: 4, code: "n4", name: "JLPT N4", family: "jlpt" }];
  const access = { learning: { n5: "full", n4: "preview" }, source_grants: [], replay_levels: [] };
  const complete = { module: { total: 1, completed: 1, complete: true } };
  const partial = { video: { total: 3, completed: 1, complete: false }, module: { total: 1, completed: 1, complete: true } };
  const rows = [
    { program_id: 5, chapter: { id: 9, access: "full" }, progress: { activities: complete } },
    { program_id: 5, chapter: { id: 10, access: "full" }, progress: { activities: partial } },
    { program_id: 4, chapter: { id: 11, access: "locked" } },
    { program_id: 4, chapter: { id: 12, access: "preview" }, progress: { activities: { module: { total: 1, completed: 0, complete: false } } } },
    { program_id: 4, chapter: { id: 13, access: "none" } },
  ];
  const api = learningHarness({ programs, access, chapters: rows });
  const signal = new AbortController().signal;
  const result = await api.learningDashboard(signal);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].path, "/api/student/dashboard");
  assert.equal(api.calls[0].options.signal, signal);
  assert.deepEqual(Array.from(result.chapters, item => item.chapter.id), [9, 10, 12]);
  const next = result.chapters.find(item => Object.values(item.progress.activities).some(activity => !activity.complete)) ?? result.chapters[0];
  assert.equal(next.chapter.id, 10);
  const activities = result.chapters.filter(item => item.program.id === next.program.id).flatMap(item => Object.values(item.progress.activities));
  assert.equal(api.completionPercent(Object.fromEntries(activities.map((activity, index) => [index, activity]))), 60);
  assert.equal(result.chapters.reduce((sum, item) => sum + (item.progress.activities.module?.completed ?? 0), 0), 2);
  assert.equal(api.completionPercent({}), 0);
});

test("dashboard empty data remains empty; accessible progress must exist, locked progress never used", async () => {
  const empty = learningHarness({ programs: [], access: {}, chapters: [] });
  assert.equal((await empty.learningDashboard()).chapters.length, 0);
  const missing = learningHarness({ programs: [{ id: 1 }], access: {}, chapters: [{ program_id: 1, chapter: { access: "preview" } }] });
  await assert.rejects(missing.learningDashboard(), /Invalid dashboard chapter progress/);
  const locked = learningHarness({ programs: [{ id: 1 }], access: {}, chapters: [{ program_id: 1, chapter: { access: "locked" }, progress: { activities: { module: { completed: 999 } } } }] });
  assert.equal((await locked.learningDashboard()).chapters.length, 0);
});

const aborted = error => error.name === "AbortError";
const status = expected => error => error.status === expected;

test("concurrent GETs coalesce, payloads isolate, later GETs stay fresh", async () => {
  const api = harness();
  const first = api.apiRequest("/api/me");
  const second = api.apiRequest("/api/me", { method: "get" });
  assert.equal(api.calls.length, 1);
  api.calls[0].resolve({ data: { id: 1 } });
  const [a, b] = await Promise.all([first, second]);
  a.data.id = 99;
  assert.equal(b.data.id, 1);
  const fresh = api.apiRequest("/api/me");
  assert.equal(api.calls.length, 2);
  api.calls[1].resolve({ data: { id: 2 } });
  assert.equal((await fresh).data.id, 2);
});

test("guest auth bootstrap leaves concurrent public reads alive and coalesced", async () => {
  const api = harness();
  const paths = ["/api/public/offers", "/api/public/programs", "/api/public/articles", "/api/public/testimonials"];
  const publicReads = paths.map(path => api.apiRequest(path));
  const bootstrap = api.apiRequest("/api/me").catch(error => {
    assert.equal(error.status, 401);
    api.setApiAuthenticated(false, false);
  });
  api.calls[4].resolve({}, 401);
  await bootstrap;
  assert.ok(api.calls.slice(0, 4).every(call => !call.options.signal.aborted));
  const duplicate = api.apiRequest(paths[0]);
  assert.equal(api.calls.length, 5);
  paths.forEach((path, index) => api.calls[index].resolve({ data: path }));
  assert.deepEqual((await Promise.all(publicReads)).map(result => result.data), paths);
  assert.equal((await duplicate).data, paths[0]);
  const fresh = api.apiRequest(paths[0]);
  assert.equal(api.calls.length, 6);
  api.calls[5].resolve({ data: "fresh" });
  assert.equal((await fresh).data, "fresh");
});

test("guest confirmation after authentication and explicit guest boundaries invalidate reads", async () => {
  const api = harness();
  api.setApiAuthenticated(true);
  const authenticatedRead = api.apiRequest("/api/me");
  const authenticatedFailure = assert.rejects(authenticatedRead, aborted);
  api.setApiAuthenticated(false, false);
  await authenticatedFailure;
  assert.equal(api.calls[0].options.signal.aborted, true);
  const guestRead = api.apiRequest("/api/me");
  const guestFailure = assert.rejects(guestRead, aborted);
  api.setApiAuthenticated(false);
  await guestFailure;
  assert.equal(api.calls[1].options.signal.aborted, true);
  const next = api.apiRequest("/api/me");
  assert.equal(api.calls.length, 3);
  api.calls[2].resolve({ data: {} });
  await next;
});

test("headers and session changes never share reads", async () => {
  const api = harness();
  const old = api.apiRequest("/api/me");
  const oldFailure = assert.rejects(old, aborted);
  api.setApiAuthenticated(true);
  assert.equal(api.calls[0].options.signal.aborted, true);
  const current = api.apiRequest("/api/me");
  const otherHeaders = api.apiRequest("/api/me", { headers: { "Accept-Language": "id" } });
  assert.equal(api.calls.length, 3);
  api.calls[1].resolve({ data: { id: 2 } });
  api.calls[2].resolve({ data: { id: 3 } });
  await oldFailure;
  assert.equal((await current).data.id, 2);
  assert.equal((await otherHeaders).data.id, 3);
});

test("subscriber cancellation independent; last abort cancels fetch; pre-abort sends nothing", async () => {
  const api = harness();
  const a = new AbortController();
  const b = new AbortController();
  const first = api.apiRequest("/api/me", { signal: a.signal });
  const second = api.apiRequest("/api/me", { signal: b.signal });
  const failure = assert.rejects(first, aborted);
  a.abort();
  await failure;
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].options.signal.aborted, false);
  api.calls[0].resolve({ data: { id: 1 } });
  assert.equal((await second).data.id, 1);
  const abandoned = api.apiRequest("/api/me", { signal: b.signal });
  const abandonedFailure = assert.rejects(abandoned, aborted);
  b.abort();
  await abandonedFailure;
  assert.equal(api.calls[1].options.signal.aborted, true);
  await assert.rejects(api.apiRequest("/api/me", { signal: b.signal }), aborted);
  assert.equal(api.calls.length, 2);
  const next = api.apiRequest("/api/me");
  assert.equal(api.calls.length, 3);
  api.calls[2].resolve({ data: {} });
  await next;
});

test("429 displays existing error and never retries", async () => {
  const api = harness();
  const first = api.apiRequest("/api/me");
  const second = api.apiRequest("/api/me");
  const failures = [first, second].map(task => assert.rejects(task, error => error.status === 429 && error.message === "Terlalu banyak percobaan. Silakan coba lagi nanti."));
  api.calls[0].resolve({}, 429);
  await Promise.all(failures);
  assert.equal(api.calls.length, 1);
  const fresh = api.apiRequest("/api/me");
  assert.equal(api.calls.length, 2);
  api.calls[1].resolve({ data: {} });
  await fresh;
});

test("writes reuse live CSRF cookie, never dedup or retry, reread rotated token", async () => {
  const api = harness("XSRF-TOKEN=first%20token");
  const first = api.apiRequest("/api/student/invoices", { method: "POST", body: "{}" });
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].options.headers.get("X-XSRF-TOKEN"), "first token");
  api.calls[0].resolve({}, 204);
  await first;
  api.document.cookie = "XSRF-TOKEN=rotated";
  const second = api.apiRequest("/api/student/invoices", { method: "POST", body: "{}" });
  assert.equal(api.calls.length, 2);
  assert.equal(api.calls[1].options.headers.get("X-XSRF-TOKEN"), "rotated");
  const failure = assert.rejects(second, status(429));
  api.calls[1].resolve({}, 429);
  await failure;
  assert.equal(api.calls.length, 2);
});

test("missing CSRF cookie initializes once for concurrent writes; 419 never retries", async () => {
  const api = harness();
  const first = api.apiRequest("/api/student/invoices", { method: "POST" });
  const second = api.apiRequest("/api/student/invoices", { method: "POST" });
  assert.equal(api.calls.length, 1);
  assert.equal(new URL(api.calls[0].url).pathname, "/sanctum/csrf-cookie");
  api.document.cookie = "XSRF-TOKEN=ready";
  api.calls[0].resolve({}, 204);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.calls.length, 3);
  const failures = [first, second].map(task => assert.rejects(task, status(419)));
  api.calls[1].resolve({}, 419);
  api.calls[2].resolve({}, 419);
  await Promise.all(failures);
  assert.equal(api.calls.length, 3);
});

test("session change during CSRF init prevents old write", async () => {
  const api = harness();
  const old = api.apiRequest("/api/student/invoices", { method: "POST" });
  const failure = assert.rejects(old, status(419));
  api.setApiAuthenticated(false);
  api.document.cookie = "XSRF-TOKEN=new-session";
  api.calls[0].resolve({}, 204);
  await failure;
  assert.equal(api.calls.length, 1);
});
