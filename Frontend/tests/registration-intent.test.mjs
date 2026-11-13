import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const storage = new Map();
function load(file, require) {
  const context = vm.createContext({ exports: {}, URL, Date, require, sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  vm.runInContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}
const free = load("../src/lib/free-chapter.ts");
const destination = load("../src/lib/auth-destination.ts", () => free);
const intent = load("../src/lib/registration-intent.ts", () => destination);

test("purchase intent is account-scoped, expires, and accepts only safe purchase routes", () => {
  for (const path of ["/checkout?program=N4&plan=lms&referral=A%2BB", "/checkout?program=SSW&plan=sensei", "/invoice?id=42"]) {
    intent.writeRegistrationIntent(7, path);
    assert.equal(intent.readRegistrationIntent(7), path);
    assert.equal(intent.readRegistrationIntent(8), null);
    assert.equal(intent.readRegistrationIntent(7), null);
  }
  for (const path of ["https://evil.test/checkout", "/dashboard", "/checkout?program=N4&plan=free", "/checkout?plan=lms", "/invoice", "/invoice?id=oops"]) {
    intent.writeRegistrationIntent(7, path);
    assert.equal(intent.readRegistrationIntent(7), null);
  }
  intent.writeRegistrationIntent(7, "/invoice?id=42");
  const [key, raw] = [...storage][0];
  storage.set(key, JSON.stringify({ ...JSON.parse(raw), updatedAt: Date.now() - 30 * 60 * 1000 }));
  assert.equal(intent.readRegistrationIntent(7), null);
  storage.set(key, "{invalid");
  assert.equal(intent.readRegistrationIntent(7), null);
  intent.writeRegistrationIntent(7, "/invoice?id=42");
  intent.clearRegistrationIntent();
  assert.equal(intent.readRegistrationIntent(7), null);
});
