import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;

test("gamification reads use shared authenticated API and forward cancellation", async () => {
  const calls = [];
  const payload = { entries: [], self: null };
  const context = vm.createContext({ exports: {}, require: () => ({ apiRequest: async (path, options) => { calls.push({ path, options }); return { data: payload }; } }) });
  vm.runInContext(compile(read("../src/lib/learning-api.ts")), context);
  const signal = new AbortController().signal;
  for (const scope of ["all", "lms", "sensei"]) {
    assert.equal(await context.exports.studentLeaderboard(scope, signal), payload);
    assert.equal(calls.at(-1).path, `/api/student/leaderboard?scope=${scope}`);
    assert.equal(calls.at(-1).options.signal, signal);
  }
  assert.equal(await context.exports.studentGamification(signal), payload);
  assert.equal(calls.at(-1).path, "/api/student/gamification");
  assert.equal(calls.at(-1).options.signal, signal);
});

test("leaderboard keeps top twenty and exactly one outside self, filters scope", () => {
  let requestedScope;
  const entries = Array.from({ length: 20 }, (_, index) => ({ user_id: index + 1, rank: index + 1, name: `Student ${index + 1}`, avatar_url: null, category: "lms", weekly_xp: 20 - index, streak_days: 3, is_current_user: false }));
  const self = { ...entries[0], user_id: 99, rank: 99, name: "Current Student", is_current_user: true };
  let data = { entries: [...entries, self], self };
  const context = vm.createContext({ exports: {}, React, require: path => {
    if (path === "react") return React;
    if (path === "react-icons/lu") return { LuInfo: () => null };
    if (path === "@/components/loading-skeleton") return { LoadingSkeleton: ({ label }) => React.createElement("div", { role: "status" }, label) };
    if (path.endsWith("student-avatar")) return { StudentAvatar: ({ name }) => React.createElement("span", null, name) };
    if (path.endsWith("learning-api")) return { studentLeaderboard: scope => { requestedScope = scope; } };
    if (path.endsWith("learning-hooks")) return { useLearningRequest: load => { load(); return { data, loading: false }; } };
    throw new Error(path);
  } });
  vm.runInContext(compile(read("../src/components/student-leaderboard-screen.tsx")), context);
  const render = () => renderToStaticMarkup(React.createElement(context.exports.StudentLeaderboardScreen));
  const markup = render();
  assert.equal(requestedScope, "all");
  assert.equal((markup.match(/<li value=/g) ?? []).length, 21);
  assert.equal((markup.match(/value="99"/g) ?? []).length, 1);
  assert.match(markup, /Current Student \(Kamu\)/);
  assert.match(markup, /LMS Mandiri · 20 XP · 3 Hari Streak/);
  assert.match(markup, /<dialog[^>]+aria-labelledby=/);
  assert.match(markup, /Aturan Leaderboard HiruAcademy/);
  assert.match(markup, /Senin pukul 00.00 WIB/);
  data = { entries, self: { ...entries[0], is_current_user: true } };
  assert.equal((render().match(/<li value=/g) ?? []).length, 20);
  data = { entries: [], self: null };
  assert.match(render(), /Belum ada data untuk ditampilkan\./);
});
