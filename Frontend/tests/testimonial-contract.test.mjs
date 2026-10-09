import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("student admin PATCH is restricted, manual save excludes student metadata", () => {
  const source = read("../src/components/admin-testimonial-prototype.tsx");
  const tree = ts.createSourceFile("testimonials.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let patchFields;
  let manualFields;
  let patchBody;
  function visit(node) {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "StudentPatch") patchFields = node.type.members.map(member => member.name.getText(tree));
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "next" && ts.isObjectLiteralExpression(node.initializer)) manualFields = node.initializer.properties.map(property => property.name?.getText(tree));
    if (ts.isFunctionDeclaration(node) && node.name?.text === "patchStudent") patchBody = node.body.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.deepEqual(patchFields, ["moderation_status", "moderation_note", "published", "landing", "sort_order"]);
  assert.deepEqual(manualFields, ["id", "name", "context", "quote", "image", "videoUrl", "videoTitle", "published", "landing", "order"]);
  assert.match(patchBody, /row\.source !== "student"/);
  assert.match(patchBody, /body: JSON\.stringify\(patch\)/);
  assert.match(source, /patchStudent\(row, \{ moderation_status: "approved" \}\)/);
});

test("student submission excludes identity and public landing keeps its filter", () => {
  const source = read("../src/app/profile/testimoni/page.tsx");
  assert.match(source, /JSON\.stringify\(\{ context: context\.trim\(\), quote: quote\.trim\(\), consent_public: true \}\)/);
  assert.match(source, /cause\.status === 409/);
  assert.match(source, /if \(submitting\.current \|\| locked\) return/);
  assert.match(read("../src/app/page.tsx"), /\/api\/testimonials\?landing=true/);
  assert.match(read("../src/app/testimoni/page.tsx"), /<StudentAvatar /);
});
