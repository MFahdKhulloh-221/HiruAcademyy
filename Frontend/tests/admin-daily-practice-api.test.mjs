import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const calls = [];
const sessions = ["vocabulary_kanji", "grammar", "reading", "audio"];
const context = vm.createContext({ exports: {}, require: () => ({
  assessmentSessions: sessions, jlptTryoutSessions: ["Vocabulary", "Grammar", "Reading", "Audio"],
  apiRequest: async (path, options) => { calls.push({ path, options }); return { data: { id: 9 } }; },
}) });
vm.runInContext(ts.transpileModule(readFileSync(new URL("../src/lib/admin-daily-practice-api.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { saveDailyStudio, saveDailySettings, dailyLocked } = context.exports;
const question = { id: "temporary-question", section: "Vocabulary", prompt: "Question", instruction: "", answers: ["One", "Two", "Three", "Four"], correctAnswer: 2, explanation: "Answer", passageId: "temporary-passage", passage: "", pointValue: 1.25, order: "0", status: "Published" };
const baseline = { studioRevision: "revision-1", questions: [{ id: "10" }], passages: [{ id: "11" }] };
await saveDailyStudio({ id: 9, category: "vocabulary", status: "draft" }, { questions: [question], passages: [{ id: "temporary-passage", title: "Shared", body: "Body", daily_practice_id: 9, created_at: "server", image_resolved_url: "server", blocks: [{ type: "text", text: "Body" }] }] }, baseline);
assert.equal(calls.filter(call => call.options?.method).length, 1, "one atomic studio mutation");
assert.equal(calls[0].path, "/api/admin/daily-practices/9/studio");
const payload = JSON.parse(calls[0].options.body);
assert.equal(payload.revision, "revision-1");
assert.deepEqual(payload.settings, { status: "draft" });
assert.deepEqual(Object.keys(payload.passages[0]).sort(), ["id", "title", "body", "blocks", "image", "image_alt", "image_position"].sort());
assert.equal(payload.questions[0].content.session, "vocabulary_kanji");
assert.equal(payload.questions[0].content.correct_option, "C");
assert.equal(payload.questions[0].content.passage_id, payload.passages[0].id);
assert.equal(payload.passages[0].blocks[0].text, "Body");
assert.deepEqual(payload.deleted_question_ids, [10]);
assert.deepEqual(payload.deleted_passage_ids, [11]);
assert.equal(dailyLocked({ attempts_count: 1 }), true);
assert.equal(dailyLocked({ has_attempts: true }), true);
assert.equal(dailyLocked({ locked: true }), true);
assert.equal(dailyLocked({ attempts_count: 0 }), false);
const settings = { title: "Daily", category: "grammar", target_level: "n5", status: "draft", starts_at: "2026-11-13T08:00:00+07:00", ends_at: "2026-11-13T10:00:00+07:00" };
await saveDailySettings({ ...settings, id: 9, question_count: 2, questions: [], studio_revision: "server" }, 9);
assert.equal(calls.at(-1).options.method, "PATCH");
assert.deepEqual(JSON.parse(calls.at(-1).options.body), settings);
console.log("Daily practice admin atomic persistence checks passed.");
