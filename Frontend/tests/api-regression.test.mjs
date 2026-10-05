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
