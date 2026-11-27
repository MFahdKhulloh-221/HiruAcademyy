// Run from Frontend: node src/lib/program-achievement-api.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { outputText } = ts.transpileModule(readFileSync(new URL("./program-achievement-api.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
class ApiError extends Error { constructor(status) { super(); this.status = status; } }
const row = { id: 7, program_id: 5, presentation_snapshot: { title: "N5" } };
let eligible = false;
let failStatus = false;
const calls = [];
const apiRequest = async (path, options) => {
  calls.push({ path, options });
  if (path.endsWith("/status")) {
    if (failStatus) throw new Error("Status unavailable");
    return { data: { eligible, reason: eligible ? "eligible" : "mini_incomplete", completed_chapters: eligible ? 2 : 1, total_chapters: 2, achievement: row } };
  }
  if (path.endsWith("/reconcile")) return { data: row, reason: "existing" };
  if (path.endsWith("/notices")) return { data: [row] };
  if (path.endsWith("/7")) return { data: row };
  return { data: [row], meta: { current_page: 1, last_page: 2, total: 2, per_page: 1 } };
};
const exports = {};
runInNewContext(outputText, { exports, require: () => ({ apiRequest, ApiError }) });
const signal = new AbortController().signal;
const hidden = await exports.studentAchievements(1, signal);
assert.equal(hidden.data.length, 0);
assert.equal(hidden.meta.last_page, 2); // Hidden page must not remove pagination.
assert.equal((await exports.achievementNotices(signal)).length, 0);
await assert.rejects(exports.studentAchievement(7, signal), error => error.status === 404);
const reconciliation = await exports.reconcileAchievement(5);
assert.equal(reconciliation.data, null);
assert.equal(reconciliation.reason, "mini_incomplete");
assert.equal(row.presentation_snapshot.title, "N5"); // No snapshot mutation.
assert.ok(calls.filter(call => call.path.endsWith("/status") && call.options?.signal).every(call => call.options.signal === signal));
eligible = true;
assert.equal((await exports.studentAchievements(1, signal)).data[0], row);
assert.equal((await exports.studentAchievement(7, signal)), row);
assert.equal((await exports.achievementNotices(signal))[0], row);
assert.equal((await exports.reconcileAchievement(5)).reason, "existing");
failStatus = true;
await assert.rejects(exports.studentAchievements(1, signal), /Status unavailable/);
await assert.rejects(exports.studentAchievement(7, signal), /Status unavailable/);
await assert.rejects(exports.achievementNotices(signal), /Status unavailable/);
console.log("Program achievement display checks passed");
