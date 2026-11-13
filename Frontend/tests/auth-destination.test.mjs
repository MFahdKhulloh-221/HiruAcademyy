import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(file, require) {
  const context = vm.createContext({ exports: {}, URL, require });
  vm.runInContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}
const free = load("../src/lib/free-chapter.ts");
const { safeAuthDestination } = load("../src/lib/auth-destination.ts", () => free);

test("auth return preserves checkout/invoice query and exact free chapter", () => {
  for (const value of ["/checkout", "/checkout?program=SSW&plan=sensei&referral=A%2BB", "/invoice?id=123&token=a%2Fb", free.freeChapterPath]) assert.equal(safeAuthDestination(value), value);
  assert.equal(free.freeChapterDestination("/checkout"), null);
});

test("auth return rejects external, malformed and unrelated destinations", () => {
  for (const value of [null, "", "https://evil.test/checkout", "//evil.test/checkout", "/\\evil.test/checkout", "javascript:alert(1)", "/checkout/../admin", "/checkout%2f..%2fadmin", "/checkout-extra", "/invoice/123", "/admin", "/checkout#//evil.test", "/checkout\n?program=N5", "/learn/dasar/chapter-1?next=/admin"]) assert.equal(safeAuthDestination(value), null, String(value));
});
