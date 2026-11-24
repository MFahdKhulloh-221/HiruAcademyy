import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const context = vm.createContext({ exports: {}, Intl });
vm.runInContext(ts.transpileModule(readFileSync(new URL("../src/lib/tryout-report-presentation.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { reportNumber, reportHistogram, groupReportQuestions, questionKey, formLetter } = context.exports;
for (const [value, expected] of [[78.92857142857143, "78,9"], [82.5, "82,5"], [100, "100"], [0, "0"], [1500, "1.500"], [null, "—"], [undefined, "—"]]) assert.equal(reportNumber(value), expected);
for (const scores of [[], [0], [82.5, 82.5], [0, 29, 29.5, 30, 59.999, 60, 179.9, 180], [-3.5, 0, 0.1, 1.2], [69.21, 69.22, 69.23]]) {
  const rows = scores.map((value, index) => ({ label: String(value), count: index + 1 }));
  const before = JSON.stringify(rows);
  const { buckets } = reportHistogram(rows);
  assert.equal(buckets.reduce((sum, item) => sum + item.count, 0), rows.reduce((sum, item) => sum + item.count, 0));
  assert.ok(buckets.every(item => Number.isInteger(item.count) && item.count >= 0));
  assert.ok(buckets.length <= 6);
  assert.equal(JSON.stringify(rows), before);
}
// Exercise every hundredth around shared boundaries without rounding source scores.
const dense = Array.from({ length: 18001 }, (_, index) => ({ label: String(index / 100), count: 1 }));
const denseBuckets = reportHistogram(dense).buckets;
assert.equal(JSON.stringify(denseBuckets.map(row => row.count)), JSON.stringify([3000, 3000, 3000, 3000, 3000, 3001]));
const boundaries = [0, 29, 29.5, 30, 59.999, 60, 179.9, 180].map((value, index) => ({ label: String(value), count: index + 1 }));
assert.equal(JSON.stringify(reportHistogram(boundaries).buckets.map(row => row.count)), JSON.stringify([6, 9, 6, 0, 0, 15]));
const predefined = [{ label: "0–49", count: 2 }, { label: "50–100", count: 3 }];
assert.equal(JSON.stringify(reportHistogram(predefined).buckets), JSON.stringify(predefined));
const first = { id: 1, fingerprint: "a", received: 3, correct: 2, wrong: 0, unanswered: 1 };
const second = { id: 1, fingerprint: "b", received: 1, correct: 0, wrong: 1, unanswered: 0 };
const questions = [second, { ...first, id: 2 }, first];
const before = JSON.stringify(questions);
const groups = groupReportQuestions(questions);
assert.equal(groups.length, 2);
assert.equal(groups[0][0], first);
assert.equal(groups[0][1], second);
assert.notEqual(questionKey(first), questionKey(second));
assert.equal(first.correct, 2);
assert.equal(second.correct, 0);
assert.equal(JSON.stringify(questions), before);
assert.equal(formLetter(0), "A");
assert.equal(formLetter(26), "AA");
console.log("Try Out presentation checks passed: number format, histogram conservation, isolated fingerprints.");
