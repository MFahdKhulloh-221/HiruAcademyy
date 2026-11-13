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
  const gamification = { weekly_xp: 0, streak_days: 0, challenge: { active_days: 0, target_days: 5, total_days: 7, starts_on: "2026-11-09", ends_on: "2026-11-15", status: "active", badge: null } };
  const context = vm.createContext({ exports: {}, require: () => ({ apiRequest: async (path, options) => { calls.push({ path, options }); return { data: path === "/api/student/gamification" ? gamification : payload }; } }) });
  vm.runInContext(compile(read("../src/lib/learning-api.ts")), context);
  const signal = new AbortController().signal;
  for (const scope of ["all", "lms", "sensei"]) {
    assert.equal(await context.exports.studentLeaderboard(scope, signal), payload);
    assert.equal(calls.at(-1).path, `/api/student/leaderboard?scope=${scope}`);
    assert.equal(calls.at(-1).options.signal, signal);
  }
  assert.equal(await context.exports.studentGamification(signal), gamification);
  assert.equal(calls.at(-1).path, "/api/student/gamification");
  assert.equal(calls.at(-1).options.signal, signal);
});

test("dashboard and leaderboard share numbered rules with separate headings", () => {
  const dashboard = read("../src/components/student-dashboard.tsx");
  const leaderboard = read("../src/components/student-leaderboard-screen.tsx");
  const styles = read("../src/app/stitch-visual.css");
  assert.match(dashboard, /import \{[^}]*LeaderboardRules[^}]*\} from "@\/components\/student-leaderboard-screen"/);
  assert.match(dashboard, /<LeaderboardRules\s*\/>/);
  assert.match(leaderboard, /<LeaderboardRules\s*\/>/);
  assert.match(styles, /\.mini-locked-dialog\.leaderboard-rules\s*\{[^}]*text-align: left/);
  assert.match(styles, /\.mini-locked-dialog\.leaderboard-rules h2\s*\{[^}]*font-weight: 700/);
  assert.match(styles, /\.leaderboard-rules ol\s*\{[^}]*list-style: decimal outside/);
  assert.match(styles, /\.leaderboard-rules li > strong\s*\{[^}]*display: block/);
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
  assert.match(markup, /Tidak ada batas XP per hari maupun per minggu/);
  assert.match(markup, /10 XP per materi baru/);
  assert.match(markup, /20 XP/);
  assert.match(markup, /Tambahan 30 XP/);
  assert.match(markup, /Mengulang aktivitas yang sama pada hari berikutnya tidak memberi XP lagi/);
  assert.doesNotMatch(markup, /Maksimal 50 XP|maksimum 350 XP|setiap hari\. Attempt/);
  assert.match(markup, /Streak tidak direset setiap minggu/);
  assert.match(markup, /5 hari berbeda dalam 7 hari pertama/);
  assert.match(markup, /<strong>Ranking mingguan\.<\/strong>/);
  assert.match(markup, /Senin pukul 00.00 WIB/);
  data = { entries, self: { ...entries[0], is_current_user: true } };
  assert.equal((render().match(/<li value=/g) ?? []).length, 20);
  data = { entries: [], self: null };
  assert.match(render(), /Belum ada data untuk ditampilkan\./);
});
