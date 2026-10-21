import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("showcase capacity expanded to ten items with canonical labels", () => {
  const showcaseSource = read("../src/components/admin-showcase-prototype.tsx");
  const expectedShowcase = [
    { key: "dashboard", label: "Dashboard" },
    { key: "journey", label: "Pembelajaran" },
    { key: "lesson", label: "Materi / Video Lesson" },
    { key: "flashcard", label: "Flashcard" },
    { key: "evaluation", label: "Try Out / Evaluasi" },
    { key: "module", label: "Modul" },
    { key: "practice", label: "Latihan" },
    { key: "checkpoint", label: "Checkpoint" },
    { key: "replay", label: "Jadwal & Replay" },
    { key: "community", label: "Komunitas" },
  ];

  for (const item of expectedShowcase) {
    assert.match(
      showcaseSource,
      new RegExp(`key:\\s*"${item.key}",\\s*label:\\s*"${item.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `Missing showcase identifier: ${item.key}`
    );
  }

  const keysMatch = [...showcaseSource.matchAll(/key:\s*"([a-z]+)"/g)].map(m => m[1]);
  for (const item of expectedShowcase) {
    assert.ok(keysMatch.includes(item.key), `Approved key ${item.key} is registered`);
  }
});

test("builder hides identifier and automatically allocates slots six through ten", () => {
  const source = read("../src/components/admin-showcase-prototype.tsx");
  const builder = source.slice(source.indexOf('<form className="admin-prototype-form"'), source.indexOf('</form>'));
  assert.ok(!builder.includes("Identifier (dikunci)"));
  assert.ok(!builder.includes("draft.key"));
  assert.match(source, /const item = approvedShowcase\.find\(item => !rows\.some\(row => row\.key === item\.key\)\)/);
  const items = [...source.matchAll(/\{ key: "([a-z]+)", label: "([^"]+)" \}/g)].map(([, key, label]) => ({ key, label }));
  const rows = items.slice(0, 5);
  for (const key of ["module", "practice", "checkpoint", "replay", "community"]) {
    const next = items.find(item => !rows.some(row => row.key === item.key));
    assert.equal(next?.key, key);
    rows.push(next);
  }
  assert.equal(items.find(item => !rows.some(row => row.key === item.key)), undefined);
});

test("showcase names are editable and backend preserves custom labels", () => {
  const source = read("../src/components/admin-showcase-prototype.tsx");
  const service = read("../../Backend/app/Services/PublicContentService.php");
  const migration = read("../../Backend/database/migrations/2026_10_21_000002_allow_custom_showcase_labels.php");
  assert.ok(!source.includes("Copy (dikunci)"));
  assert.match(source, /Nama showcase<input required maxLength=\{255\} value=\{draft.label\} onChange=/);
  assert.ok(!service.includes("Label is locked to showcase key."));
  assert.ok(!service.includes("$model->label = $label"));
  assert.ok(service.includes("'label' => [...$string, 'regex:/\\S/u']"));
  assert.match(migration, /showcase_items_keys_check CHECK \(key IN/);
  assert.ok(!migration.includes("AND label ="));
});

test("limit popup replaces inline status text and uses accessible AdminDialog", () => {
  const showcaseSource = read("../src/components/admin-showcase-prototype.tsx");

  // Inline status string must be removed
  assert.ok(
    !showcaseSource.includes("Semua identifier showcase sudah tersedia."),
    "Old inline status message must not be used"
  );

  // Limit state and dialog must be present
  assert.match(showcaseSource, /limitReached/);
  assert.match(showcaseSource, /setLimitReached\(true\)/);
  assert.match(showcaseSource, /<AdminDialog[^>]*open=\{limitReached\}[^>]*title="Batas Showcase Tercapai"/);
  assert.match(showcaseSource, /actions=\{<button[^>]*onClick=\{.*setLimitReached\(false\)/);
  assert.match(showcaseSource, /Semua 10 slot showcase sudah terisi/);

  // AdminDialog primitive must handle focus trapping, modal semantics and Escape key
  const primitivesSource = read("../src/components/admin-primitives.tsx");
  assert.match(primitivesSource, /role="dialog"/);
  assert.match(primitivesSource, /aria-modal="true"/);
  assert.match(primitivesSource, /event\.key === "Escape"/);
  assert.match(primitivesSource, /returnFocus\.current\?\.focus\(\)/);
});

test("admin preview sorts by order and supports sequence and individual preview", () => {
  const showcaseSource = read("../src/components/admin-showcase-prototype.tsx");

  // Filter toolbar has public sequence preview button
  assert.match(showcaseSource, /onClick=\{.*setPreview\("public"\)\}.*Pratinjau urutan tampil/);

  // Table actions have individual preview button
  assert.match(showcaseSource, /onClick=\{.*setPreview\(row\.id\)\}.*Pratinjau/);

  // Preview dialog sorts by order and handles public vs individual
  assert.match(showcaseSource, /rows\.filter\(row => preview === "public" \? row\.visible : row\.id === preview\)\.sort\(\(a, b\) => a\.order - b\.order\)/);
});

test("dead duplicate useAdminContent removed from public-content-api", () => {
  const publicApiSource = read("../src/lib/public-content-api.ts");
  const adminApiSource = read("../src/lib/admin-content-api.ts");
  const showcaseSource = read("../src/components/admin-showcase-prototype.tsx");

  assert.ok(
    !publicApiSource.includes("function useAdminContent"),
    "Dead duplicate useAdminContent must be removed from public-content-api"
  );

  assert.ok(
    adminApiSource.includes("export function useAdminContent"),
    "Canonical useAdminContent must exist in admin-content-api"
  );

  assert.match(
    showcaseSource,
    /from "@\/lib\/admin-content-api"/,
    "Showcase component must import useAdminContent from canonical admin-content-api"
  );
});
