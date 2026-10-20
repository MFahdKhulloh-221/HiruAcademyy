import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("counter counts from zero, caps target, observes once, and cleans up", () => {
  for (const reduced of [false, true]) {
    const counters = [
      { dataset: { counter: "2300", locale: "id-ID", suffix: "+" }, textContent: "2.300+" },
      { dataset: { counter: "92", locale: "id-ID", suffix: "%" }, textContent: "92%" },
      { dataset: { counter: "4.9", locale: "id-ID", decimals: "1", suffix: " / 5" }, textContent: "4,9 / 5" },
      { dataset: { counter: "100", suffix: "+" }, textContent: "100+" },
    ];
    const root = { dataset: {}, matches: () => true, querySelector: () => null, querySelectorAll: selector => selector === "[data-counter]" ? counters : [] };
    const frames = new Map();
    let id = 0;
    let callback;
    let unobserved = 0;
    let disconnected = false;
    let cleanup;
    const Observer = class {
      constructor(cb) { callback = cb; }
      observe() {}
      unobserve() { unobserved++; }
      disconnect() { disconnected = true; }
    };
    const context = vm.createContext({
      exports: {}, require: () => ({ useEffect: effect => { cleanup = effect(); } }),
      document: { querySelector: () => root },
      window: { matchMedia: () => ({ matches: reduced }), IntersectionObserver: Observer, clearTimeout() {} },
      IntersectionObserver: Observer, performance: { now: () => 0 },
      requestAnimationFrame: cb => { frames.set(++id, cb); return id; },
      cancelAnimationFrame: frame => frames.delete(frame),
    });
    const source = readFileSync(new URL("../src/components/landing-motion.tsx", import.meta.url), "utf8");
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
    context.exports.LandingMotion({ selector: "[data-testimonial-motion]" });
    const text = () => counters.map(counter => counter.textContent);
    const expected = ["2.300+", "92%", "4,9 / 5", "100+"];
    if (reduced) {
      assert.deepEqual(text(), expected);
      assert.equal(frames.size, 0);
    } else {
      assert.deepEqual(text(), ["0+", "0%", "0,0 / 5", "0+"]);
      callback([{ isIntersecting: true, target: root }]);
      const tick = now => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach(cb => cb(now));
      };
      tick(700);
      assert.deepEqual(text(), ["2.013+", "81%", "4,3 / 5", "88+"]);
      tick(2000);
      assert.deepEqual(text(), expected);
      callback([{ isIntersecting: true, target: root }]);
      assert.equal(frames.size, 0);
      assert.equal(unobserved, 2);
    }
    cleanup();
    assert.equal(frames.size, 0);
    if (!reduced) assert.equal(disconnected, true);
  }
});
