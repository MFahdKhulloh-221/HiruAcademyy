import { expect, test } from "./canonical-fixture";

test("daily admin keeps WIB schedule, fixed category, atomic studio and daily analytics", async ({ page }) => {
  let item: Record<string, unknown> | null = null;
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const reports: string[] = [];
  let tryoutRequests = 0;
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [{ id: 1, code: "n5", name: "JLPT N5", status: "active" }] } }));
  await page.route("**/api/admin/try-outs**", route => { tryoutRequests++; return route.fulfill({ status: 500, json: {} }); });
  await page.route("**/api/admin/daily-practices**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method === "POST") {
      const body = route.request().postDataJSON(); writes.push({ path, body });
      item = { ...body, id: 9, question_count: 1, attempts_count: 0, studio_revision: "revision-1", builder_capabilities: { images: false, decimal_points: true }, passages: [], questions: [{ id: 91, session: "grammar", question: "Pertanyaan uji", options: { A: "Satu", B: "Dua", C: "Tiga", D: "Empat" }, correct_option: "A", explanation: "Pembahasan", point_value: 1, sort_order: 0, status: "published" }] };
      return route.fulfill({ status: 201, json: { data: item } });
    }
    if (method === "PATCH") { const body = route.request().postDataJSON(); writes.push({ path, body }); expect(Object.keys(body).sort()).toEqual(["title", "category", "target_level", "status", "starts_at", "ends_at"].sort()); item = { ...item, ...body }; return route.fulfill({ json: { data: item } }); }
    if (method === "PUT") { writes.push({ path, body: route.request().postDataJSON() }); return route.fulfill({ json: { data: item } }); }
    if (path.endsWith("/reports/participants")) { reports.push(path); return route.fulfill({ json: { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 } } }); }
    if (path.endsWith("/reports")) { reports.push(path); return route.fulfill({ json: { data: { summary: { responses: 0, unique_participants: 0, mean: null, median: null, min: null, max: null, passed: 0, failed: 0 }, histogram: [], questions: [], hardest: [] } } }); }
    return route.fulfill({ json: { data: path.endsWith("/9") ? item : item ? [item] : [] } });
  });
  await page.goto("/admin/latihan-harian");
  await page.getByRole("button", { name: "Buat Latihan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Buat Latihan Harian" });
  await dialog.getByLabel("Judul", { exact: true }).fill("Latihan Grammar Harian");
  await dialog.getByRole("combobox", { name: /^Kategori/ }).selectOption("grammar");
  await dialog.getByRole("combobox", { name: /^Target level/ }).selectOption("n5");
  await dialog.getByLabel("Mulai (WIB)").fill("2026-11-13T08:00");
  await dialog.getByLabel("Selesai (WIB)").fill("2026-11-14T10:00");
  await dialog.getByRole("button", { name: "Simpan Pengaturan" }).click();
  await expect(dialog.getByRole("alert")).toContainText("tanggal WIB yang sama");
  expect(writes).toHaveLength(0);
  await dialog.getByLabel("Selesai (WIB)").fill("2026-11-13T10:00");
  await dialog.getByRole("button", { name: "Simpan Pengaturan" }).click();
  await expect(page.getByRole("heading", { name: "Tata Bahasa", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Audio (Choukai)", exact: true })).toHaveCount(0);
  expect(writes[0].body).toMatchObject({ category: "grammar", target_level: "n5", starts_at: "2026-11-13T08:00:00+07:00", ends_at: "2026-11-13T10:00:00+07:00" });
  await page.getByRole("button", { name: "Simpan Latihan Harian", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Seluruh soal dan bacaan tersimpan." })).toBeVisible();
  expect(writes[1].path).toBe("/api/admin/daily-practices/9/studio");
  expect(writes[1].body).toMatchObject({ revision: "revision-1", passages: [], questions: [{ id: "91", content: { session: "grammar", correct_option: "A" } }] });
  await page.getByRole("button", { name: "Kembali ke Daftar", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit Latihan Harian" });
  await editDialog.getByLabel("Judul", { exact: true }).fill("Latihan Grammar Diperbarui");
  await editDialog.getByRole("button", { name: "Simpan Pengaturan" }).click();
  await expect(page.getByRole("cell", { name: "Latihan Grammar Diperbarui", exact: true })).toBeVisible();
  await page.screenshot({ path: "C:/Users/Tulo/AppData/Local/Temp/opencode/daily-admin-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["Edit", "Kelola Soal", "Analisis", "Hapus"]) {
    const action = page.getByRole("button", { name, exact: true });
    await expect(action).toBeVisible();
    const bounds = await action.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "C:/Users/Tulo/AppData/Local/Temp/opencode/daily-admin-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Analisis", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Analisis Hasil Latihan Harian", exact: true })).toBeVisible();
  await expect(page.getByText("Belum ada attempt selesai sesuai filter.", { exact: true })).toBeVisible();
  expect(reports).toContain("/api/admin/daily-practices/9/reports");
  expect(reports).toContain("/api/admin/daily-practices/9/reports/participants");
  expect(tryoutRequests).toBe(0);
  await expect(page.getByRole("button", { name: "Unduh Excel", exact: true })).toHaveCount(0);
});
