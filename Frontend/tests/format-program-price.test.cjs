const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/format-program-price.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
for (const [input, expected] of [[99000, "99K"], [350000, "350K"], [999900, "999,9K"], [1000000, "1JT"], [1500000, "1,5JT"], [2750000, "2,75JT"], [0, "Gratis"], [null, "Belum tersedia"], [999999, "Rp999.999"], [1000001, "Rp1.000.001"]]) {
  assert.equal(context.exports.formatProgramPrice(input), expected);
}
console.log("PASS: 10 exact price formatter cases");
