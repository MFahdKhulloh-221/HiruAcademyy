import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const context = vm.createContext({ exports: {}, require: path => {
  if (path.endsWith("assessment-content")) return { AssessmentContent: ({ content, children }) => createElement("div", null, createElement("img", { src: content.image_resolved_url || content.image, alt: content.image_alt || "" }), children) };
  if (path.endsWith("placement-rich-text")) return { PlacementRichText: ({ value }) => createElement("span", null, value) };
  if (path.endsWith(".css")) return { default: {} };
  return require(path);
} });
const source = readFileSync(new URL("../src/components/assessment-passage-content.tsx", import.meta.url), "utf8");
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const render = passage => renderToStaticMarkup(createElement(context.exports.AssessmentPassageContent, { passage }));

test("passage renders text-image-text in stored order without legacy duplication", () => {
  const html = render({ body: "Legacy body", image: "/legacy.png", blocks: [{ type: "text", text: "Teks pertama" }, { type: "image", image: "/group.png", image_alt: "Diagram bacaan" }, { type: "text", text: "Teks lanjutan" }] });
  assert.ok(html.indexOf("Teks pertama") < html.indexOf("<img"));
  assert.ok(html.indexOf("<img") < html.indexOf("Teks lanjutan"));
  assert.ok(html.includes('alt="Diagram bacaan"'));
  assert.ok(!html.includes("Legacy body"));
  assert.ok(!html.includes("/legacy.png"));
});

test("legacy passage remains available without blocks", () => {
  for (const blocks of [undefined, null, []]) assert.ok(render({ body: "Bacaan lama", blocks }).includes("Bacaan lama"));
});
