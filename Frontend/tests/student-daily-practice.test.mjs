import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/student-daily-practice-api.ts", import.meta.url), "utf8");
const context = vm.createContext({ exports: {}, Intl, Date, require: () => ({ apiRequest: () => {}, ApiError: Error }) });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { DailyPracticePersistence, wibDate } = context.exports;
const initial = () => ({ id: 1, daily_practice_id: 2, revision: 0, status: "in_progress", answers: {}, questions: [], result: null });

test("WIB date crosses UTC date boundary", () => assert.equal(wibDate(new Date("2026-11-12T18:00:00Z")), "2026-11-13"));
test("serialized saves preserve revisions and double submit remains idempotent", async () => {
  let canonical = initial();
  const writes = [];
  const store = new DailyPracticePersistence(initial(), async (path, options) => {
    const body = JSON.parse(options.body);
    writes.push({ path, body });
    assert.equal(body.revision, canonical.revision);
    canonical = path.endsWith("/answers") ? { ...canonical, answers: body.answers, revision: canonical.revision + 1 } : { ...canonical, status: "completed", result: { earned: 1 } };
    return { data: canonical };
  });
  const first = store.save({ 1: "A" });
  const second = store.save({ 1: "B" });
  const submit = store.submit({ 1: "B" });
  assert.equal(submit, store.submit({ 1: "B" }));
  await Promise.all([first, second, submit]);
  assert.deepEqual(writes.map(write => write.body.revision), [0, 1, 2]);
  assert.equal(canonical.answers[1], "B");
});
test("stale conflict blocks queued save and submit until explicit retry, keeps local snapshot", async () => {
  let canonical = initial();
  let fail = true;
  let submissions = 0;
  const store = new DailyPracticePersistence(initial(), async (path, options) => {
    if (!options) return { data: canonical };
    const body = JSON.parse(options.body);
    if (path.endsWith("/answers")) {
      if (fail) { canonical = { ...canonical, revision: 4 }; throw new Error("stale revision"); }
      assert.equal(body.revision, 4);
      canonical = { ...canonical, answers: body.answers, revision: 5 };
    } else submissions++;
    return { data: canonical };
  });
  const local = { 1: "A" };
  await assert.rejects(store.save(local), /stale/);
  await assert.rejects(store.submit(local), /stale/);
  assert.equal(submissions, 0);
  assert.equal(local[1], "A");
  fail = false;
  await store.save(local, true);
  assert.equal(store.attempt.answers[1], "A");
});
