import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("testimonial table keeps nine core columns, scoped scroll, and full detail", () => {
  const source = read("../src/components/admin-testimonial-prototype.tsx");
  const table = source.slice(source.indexOf("<AdminDataTable"), source.indexOf("<AdminDialog"));
  assert.deepEqual([...table.matchAll(/key: "([^"]+)"/g)].map(match => match[1]), ["image", "name", "type", "source", "review", "status", "landing", "testimonials"]);
  assert.match(table, /actions=\{\{ cell:/);
  assert.match(table, /header: "Nama \/ Judul"/);
  const detail = source.slice(source.indexOf('title="Detail Testimoni"'), source.indexOf('title="Tolak Testimoni?"'));
  for (const field of ["context", "quote", "created_at", "videoUrl", "order"]) assert.ok(detail.includes(`view.${field}`), `${field} retained in detail`);
  assert.match(detail, /safeVideoUrl\(view.videoUrl\)/);
  const primitives = read("../src/components/admin-primitives.tsx");
  assert.match(primitives, /className="admin-data-table-wrap" tabIndex=\{0\} role="region" aria-label=\{caption\}/);
  const css = read("../src/app/admin/admin.css");
  assert.match(css, /\.admin-shell \.admin-testimonial-prototype \.admin-data-table-wrap \{[^}]*overflow-x: auto/);
  assert.match(css, /\.admin-data-table-wrap:focus-visible \{ outline: 3px/);
  assert.match(css, /\.admin-public-prototype\.admin-testimonial-prototype \.admin-data-table \{ min-width: 1360px; table-layout: fixed;/);
  assert.match(css, /\.admin-testimonial-prototype \.admin-data-table \.button \{ width: auto; flex: 0 0 auto; white-space: nowrap;/);
  assert.equal([...css.matchAll(/\.admin-testimonial-prototype \.admin-data-table th:nth-child\(/g)].length, 9);
});
