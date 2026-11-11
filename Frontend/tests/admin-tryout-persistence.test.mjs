import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/admin-tryout-api.ts", import.meta.url), "utf8");
test("Try Out adapter persists editable score, order, instructions and Japanese", () => {
  for (const field of ["max_score: Number(item.maxScore)", "sort_order: Number(item.order)", "instruction: question.instruction || null", "japanese: question.japanese?.text", "session_passing_scores: item.sessionPassingScores", "maxScore: String(data.max_score)", "order: String(data.sort_order)", "instruction: question.instruction ??", "japanese: question.japanese ??"]) assert.ok(source.includes(field), field);
  assert.ok(!source.includes("field teks Jepang dan instruksi belum tersedia"));
});

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const fixtures = vm.createContext({ exports: {}, require: () => ({}) });
vm.runInContext(compile(readFileSync(new URL("../src/components/admin-assessment-fixtures.ts", import.meta.url), "utf8")), fixtures);
const { assessmentPointValueError } = fixtures.exports;

test("Try Out weights accept only integers, .25, .50 and .75 within 1–180; Checkpoint stays integer", () => {
  for (const value of [1, 1.25, 1.5, 1.75, 90, 179.25, 179.5, 179.75, 180]) assert.equal(assessmentPointValueError(value, "tryout"), "", String(value));
  for (const value of [undefined, NaN, Infinity, -Infinity, 0, 0.25, 0.5, 0.75, 1.1, 1.2, 1.3, 1.6, 1.9, 180.25, 180.5, 181]) assert.ok(assessmentPointValueError(value, "tryout"), String(value));
  for (const value of [1, 90, 180]) assert.equal(assessmentPointValueError(value, "checkpoint"), "", String(value));
  for (const value of [undefined, NaN, Infinity, -Infinity, 0, 1.25, 1.5, 1.75, 181]) assert.ok(assessmentPointValueError(value, "checkpoint"), String(value));
});

function adapterHarness(decimalPoints) {
  const calls = [];
  const assessment = { id: 1, program_id: 1, builder_capabilities: { images: false, decimal_points: decimalPoints }, max_score: 180, sort_order: 1, questions: [] };
  const context = vm.createContext({ exports: {}, require: path => path.endsWith("admin-assessment-fixtures") ? fixtures.exports : {
    apiRequest: async (path, options) => {
      calls.push({ path, options });
      return { data: path === "/api/admin/programs" ? [{ id: 1, code: "n5" }] : path === "/api/admin/try-outs" ? [assessment] : assessment };
    },
    assessmentSessions: [], jlptTryoutSessions: [],
  } });
  vm.runInContext(compile(source), context);
  return { ...context.exports, calls };
}

test("Try Out adapter preserves server decimal capability and enforces weight rules on save", async () => {
  for (const flag of [true, false, undefined]) {
    const api = adapterHarness(flag);
    assert.equal((await api.loadAdminTryOuts())[0].builderCapabilities.decimal_points, flag === true);
  }
  const api = adapterHarness(true);
  const item = { id: "1", context: "N5", duration: "", status: "Draft", questions: [{ answers: [], order: "1", status: "Draft", pointValue: 1.75 }] };
  for (const value of [1, 1.25, 1.5, 1.75, 179.25, 179.5, 179.75, 180]) {
    await api.saveAdminTryOut({ ...item, questions: [{ ...item.questions[0], pointValue: value }] });
    const payload = JSON.parse(api.calls.findLast(call => call.path.endsWith("/studio")).options.body);
    assert.equal(payload.questions[0].content.point_value, value);
  }
  for (const value of [1.1, 1.2, 1.3, 1.6, 1.9, NaN, Infinity, -Infinity, 0, 0.25, 0.5, 0.75, 180.25, 181]) {
    const before = api.calls.filter(call => call.options?.method).length;
    await assert.rejects(api.saveAdminTryOut({ ...item, questions: [{ ...item.questions[0], pointValue: value }] }), /Point value/);
    assert.equal(api.calls.filter(call => call.options?.method).length, before);
  }
  await assert.rejects(api.adminAssessmentApi("checkpoint").saveAdminTryOut(item), /Point value/);
});
