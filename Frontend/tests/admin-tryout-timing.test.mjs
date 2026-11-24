import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const sessions = ["vocabulary_kanji", "grammar", "reading", "audio"];
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const fixtures = vm.createContext({ exports: {}, require: () => ({ assessmentSessions: sessions }) });
vm.runInContext(compile(readFileSync(new URL("../src/components/admin-assessment-fixtures.ts", import.meta.url), "utf8")), fixtures);
const timing = { sessionDurationMinutes: { vocabulary_kanji: "11", grammar: "12", reading: "13", audio: "14" }, breakDurationMinutes: "2" };

test("Admin preview uses total with breaks and active session timer, never legacy Try Out duration", () => {
  const require = createRequire(import.meta.url);
  const context = vm.createContext({ exports: {}, require: path => path.endsWith("admin-assessment-fixtures") ? {
    ...fixtures.exports, assessmentSections: () => sessions, orderedAssessmentQuestions: item => item.questions,
  } : path.endsWith("assessment-attempt") ? { assessmentSessions: sessions } : path.startsWith("@/") ? { AssessmentContent: ({ children }) => children, PlacementRichText: () => null } : require(path) });
  vm.runInContext(compile(readFileSync(new URL("../src/components/admin-assessment-preview.tsx", import.meta.url), "utf8")), context);
  const assessment = { id: "1", kind: "tryout", title: "Preview", duration: "999", questions: [], ...timing };
  const render = (item, initialQuestionId) => renderToStaticMarkup(createElement(context.exports.AdminAssessmentPreview, { assessment: item, initialQuestionId }));
  assert.match(render(assessment), /56 Menit/);
  assert.doesNotMatch(render(assessment), /999/);
  const question = { id: "q", section: "reading", answers: [], status: "Draft" };
  assert.match(render({ ...assessment, questions: [question] }, "q"), /Timer sesi<\/span><strong>13:00/);
  assert.match(render({ ...assessment, sessionDurationMinutes: undefined }), /Belum diatur/);
  assert.match(render({ ...assessment, kind: "checkpoint" }), /999 Menit/);
  assert.match(render({ ...assessment, kind: "checkpoint", questions: [question] }, "q"), /Timer<\/span><strong>999:00/);
});

test("Try Out requires all five positive integer durations; sums work plus three breaks", () => {
  const { tryOutTimingError, tryOutTimingTotals } = fixtures.exports;
  assert.equal(tryOutTimingError(timing), "");
  assert.deepEqual(JSON.parse(JSON.stringify(tryOutTimingTotals(timing))), { work: 50, rest: 6, total: 56 });
  assert.equal(tryOutTimingTotals({}), null);
  for (const value of ["", "0", "-1", "1.5", "Infinity", "2147483648"]) {
    assert.ok(tryOutTimingError({ ...timing, breakDurationMinutes: value }));
    for (const session of sessions) assert.ok(tryOutTimingError({ ...timing, sessionDurationMinutes: { ...timing.sessionDurationMinutes, [session]: value } }));
  }
});

test("Try Out API roundtrips session timing; Checkpoint sends legacy duration only", async () => {
  const calls = [];
  const assessment = { id: 1, program_id: 1, max_score: 180, sort_order: 1, questions: [], session_duration_minutes: { vocabulary_kanji: 11, grammar: 12, reading: 13, audio: 14 }, break_duration_minutes: 2 };
  const context = vm.createContext({ exports: {}, require: path => path.endsWith("admin-assessment-fixtures") ? fixtures.exports : {
    assessmentSessions: sessions, jlptTryoutSessions: [],
    apiRequest: async (path, options) => {
      calls.push({ path, options });
      return { data: path === "/api/admin/programs" ? [{ id: 1, code: "n5" }] : /(?:try-outs|checkpoint-packages)$/.test(path) ? [assessment] : assessment };
    },
  } });
  vm.runInContext(compile(readFileSync(new URL("../src/lib/admin-tryout-api.ts", import.meta.url), "utf8")), context);
  const item = { id: "1", context: "N5", duration: "99", status: "Draft", questions: [], ...timing };
  for (const kind of ["tryout", "checkpoint"]) {
    const api = context.exports.adminAssessmentApi(kind);
    const loaded = (await api.loadAdminTryOuts())[0];
    assert.equal(loaded.breakDurationMinutes, kind === "tryout" ? "2" : undefined);
    await api.saveAdminTryOut(item);
    const payload = JSON.parse(calls.findLast(call => call.path.endsWith("/studio")).options.body).settings;
    if (kind === "tryout") {
      assert.deepEqual(payload.session_duration_minutes, assessment.session_duration_minutes);
      assert.equal(payload.break_duration_minutes, 2);
      assert.ok(!("duration_minutes" in payload));
      const writes = calls.filter(call => call.options?.method).length;
      await assert.rejects(api.saveAdminTryOut({ ...item, breakDurationMinutes: "" }), /istirahat/);
      assert.equal(calls.filter(call => call.options?.method).length, writes);
    } else {
      assert.equal(payload.duration_minutes, 99);
      assert.ok(!("session_duration_minutes" in payload));
      assert.ok(!("break_duration_minutes" in payload));
    }
  }
});
