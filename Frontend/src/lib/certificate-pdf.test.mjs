// Run from Frontend: node src/lib/certificate-pdf.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("./certificate-pdf.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const exports = {};
runInNewContext(outputText, { exports, TextEncoder, Uint8Array });
const { buildCertificatePdf } = exports;
// Binary payload includes high bytes, NUL and line breaks: byte offsets must survive unchanged.
const jpeg = new Uint8Array([255, 216, 0, 128, 13, 10, 255, 217]);
const bytes = Buffer.from(buildCertificatePdf(jpeg, 2246, 1588));
const text = bytes.toString("latin1");
assert.ok(text.startsWith("%PDF-1.4\n"));
assert.ok(text.includes("/MediaBox [0 0 841.8898 595.2756]"));
assert.ok(text.includes("/Width 2246 /Height 1588 /ColorSpace /DeviceRGB"));
assert.ok(text.includes("/Filter /DCTDecode /Length 8"));
assert.ok(text.includes("/Count 1"));
const xrefOffset = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)[1]);
assert.equal(text.slice(xrefOffset, xrefOffset + 9), "xref\n0 6\n");
const entries = text.slice(xrefOffset).split("\n").slice(2, 8);
assert.equal(entries[0], "0000000000 65535 f ");
for (let id = 1; id <= 5; id++) {
  assert.match(entries[id], /^\d{10} 00000 n $/);
  const offset = Number(entries[id].slice(0, 10));
  assert.equal(text.slice(offset, offset + 7), `${id} 0 obj`);
}
const imageStart = text.indexOf("stream\n", text.indexOf("4 0 obj")) + 7;
assert.deepEqual(bytes.subarray(imageStart, imageStart + jpeg.length), Buffer.from(jpeg));
assert.equal(text.slice(imageStart + jpeg.length, imageStart + jpeg.length + 10), "\nendstream");
const content = /5 0 obj\n<< \/Length (\d+) >>\nstream\n/.exec(text);
const contentStart = content.index + content[0].length;
const contentLength = Number(content[1]);
assert.equal(text.slice(contentStart + contentLength, contentStart + contentLength + 9), "endstream");
assert.ok(text.slice(contentStart, contentStart + contentLength).includes("/Im0 Do"));
assert.throws(() => buildCertificatePdf(new Uint8Array(), 2246, 1588));
assert.throws(() => buildCertificatePdf(jpeg, 0, 1588));
assert.throws(() => buildCertificatePdf(jpeg, 2246, NaN));
console.log("certificate-pdf: PDF binary offsets, streams, A4 page and validation passed");
