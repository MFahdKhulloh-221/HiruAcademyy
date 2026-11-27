import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runner = readFileSync(new URL("../components/placement-runner.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/placement/page.tsx", import.meta.url), "utf8");
const dialog = runner.slice(runner.indexOf("<dialog"), runner.indexOf("</dialog>") + 9);
assert.ok(dialog.includes('aria-labelledby="placement-exit-title"'));
assert.ok(dialog.includes("Waktu tes tetap berjalan."));
assert.ok(dialog.includes("router.push(`/placement?attempt=${attempt.id}`)"));
assert.ok(!dialog.includes("flow.submit"));
assert.ok(dialog.includes("flow.busy || Boolean(flow.error)"));
assert.ok(page.includes('resumeAttempt ? `/placement/question?attempt=${resumeAttempt}` : "#placement-form"'));
const css = readFileSync(new URL("../app/stitch-visual.css", import.meta.url), "utf8");
assert.match(css, /\.placement-assessment \.placement-topbar-right\s*\{\s*display: flex;/);
console.log("Placement exit navigation + visible action container: PASS");
