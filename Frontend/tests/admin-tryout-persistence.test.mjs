import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/lib/admin-tryout-api.ts", import.meta.url), "utf8");
test("Try Out adapter persists editable score, order, instructions and Japanese", () => {
  for (const field of ["max_score: Number(item.maxScore)", "sort_order: Number(item.order)", "instruction: question.instruction || null", "japanese: question.japanese?.text", "session_passing_scores: item.sessionPassingScores", "maxScore: String(data.max_score)", "order: String(data.sort_order)", "instruction: question.instruction ??", "japanese: question.japanese ??"]) assert.ok(source.includes(field), field);
  assert.ok(!source.includes("field teks Jepang dan instruksi belum tersedia"));
});
