import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(path, dependencies = {}) {
  const context = vm.createContext({ exports: {}, require: name => dependencies[name] ?? {} });
  vm.runInContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const richText = load("../src/lib/placement-rich-text.ts");
const blocks = load("../src/lib/assessment-passage-blocks.ts", { "@/lib/placement-rich-text": richText });
const fixtures = load("../src/components/admin-assessment-fixtures.ts", { "@/lib/placement-rich-text": richText, "@/lib/assessment-passage-blocks": blocks });

test("legacy conversion preserves order, furigana, and image metadata", () => {
  const passage = { body: "<ruby>猫<rt>ねこ</rt></ruby>", image: "media/cat.png", image_alt: "Cat", image_resolved_url: "https://example.test/cat.png" };
  assert.equal(blocks.legacyPassageBlocks(passage)[0].type, "image");
  const converted = blocks.legacyPassageBlocks({ ...passage, image_position: "after" });
  assert.equal(converted[0].text, passage.body);
  assert.equal(converted[1].image_resolved_url, passage.image_resolved_url);
  assert.equal(blocks.passageBlocksBody(converted), passage.body);
  assert.equal(blocks.legacyPassageBlocks({ body: "Text" }).length, 1);
});

test("blocks require text and complete image metadata; legacy remains optional", () => {
  for (const value of [undefined, null]) assert.equal(blocks.passageBlocksError(value), "");
  for (const value of [[], [{ type: "image", image: "media/a.png", image_alt: "A" }], [{ type: "text", text: " " }], [{ type: "text", text: "Body" }, { type: "image", image: "", image_alt: "A" }], [{ type: "text", text: "Body" }, { type: "image", image: "media/a.png", image_alt: " " }], [{ type: "bad" }], [null]]) assert.ok(blocks.passageBlocksError(value));
  assert.equal(blocks.passageBlocksError([{ type: "text", text: "Body" }, { type: "image", image: "media/a.png", image_alt: "A" }]), "");
  assert.ok(fixtures.assessmentPassageError({ title: "Group", body: "Old fallback", blocks: [] }));
});

test("adapter persists ordered blocks only on Try Out passages, strips resolved URLs, derives fallback", async () => {
  for (const kind of ["tryout", "checkpoint"]) {
    const calls = [];
    const api = load("../src/lib/admin-tryout-api.ts", {
      "@/lib/assessment-passage-blocks": blocks,
      "@/components/admin-assessment-fixtures": fixtures,
      "@/lib/api": { apiRequest: async (path, options) => { calls.push({ path, options }); return { data: path === "/api/admin/programs" ? [{ id: 1, code: "n5" }] : [] }; } },
    }).adminAssessmentApi(kind);
    const passage = { id: "1", title: "Group", body: "Old", blocks: [{ type: "text", text: "First" }, { type: "image", image: "media/a.png", image_alt: " A ", image_resolved_url: "https://example.test/a.png" }, { type: "text", text: "Last" }] };
    const item = { id: "1", context: "N5", duration: "", status: "Draft", questions: [], passages: [passage], builderCapabilities: { images: true } };
    await api.saveAdminTryOut(item);
    const payload = JSON.parse(calls.find(call => call.path.endsWith("/studio")).options.body);
    const saved = payload.passages[0];
    if (kind === "tryout") {
      assert.equal(saved.body, "First\n\nLast");
      assert.deepEqual(saved.blocks, [{ type: "text", text: "First" }, { type: "image", image: "media/a.png", image_alt: "A" }, { type: "text", text: "Last" }]);
      assert.equal(saved.image, null);
      await assert.rejects(api.saveAdminTryOut({ ...item, passages: [{ ...passage, blocks: [passage.blocks[1]] }] }), /blok teks/);
      await api.saveAdminTryOut({ ...item, passages: [{ ...passage, blocks: undefined }] });
      const legacy = JSON.parse(calls.filter(call => call.path.endsWith("/studio")).at(-1).options.body);
      assert.equal(Object.hasOwn(legacy.passages[0], "blocks"), false);
    } else assert.equal(Object.hasOwn(saved, "blocks"), false);
    assert.equal(Object.hasOwn(payload.questions, "blocks"), false);
  }
});
