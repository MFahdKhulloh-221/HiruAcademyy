import { expect, test } from "./canonical-fixture";

for (const width of [1440, 768, 390]) {
  test(`Placement bank layout ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/admin/placement-configs", route => route.fulfill({ json: { data: [{ id: 7, title: "Placement", intro_heading: "Intro", duration_minutes: 7, description: "Desc", status: "draft" }] } }));
    await page.route("**/api/admin/placement-questions**", route => route.fulfill({ json: { data: [{ id: 1, placement_config_id: 7, prompt: "Pilihlah partikel yang tepat: わたしは毎朝コーヒーを飲みます。".repeat(20), options: { A: "A", B: "B", C: "C", D: "D" }, correct_option: "A", category: "Bunpou", level: "N5", status: "draft", sort_order: 1 }] } }));
    await page.goto("/admin/placement-hasil");
    const bank = page.getByRole("region", { name: "Kelompok bank soal" });
    await expect(bank.getByRole("combobox", { name: "Level kelompok", exact: true })).toHaveCount(0);
    await expect(bank.getByRole("combobox", { name: "Kategori kelompok", exact: true })).toBeVisible();
    await expect(bank.getByRole("button", { name: "+ Tambah Soal", exact: true })).toBeDisabled();
    const card = page.getByRole("list", { name: "Daftar soal Placement Test" }).getByRole("listitem");
    await expect(card.getByRole("button", { name: "Edit soal 1" })).toBeVisible();
    const box = await card.boundingBox();
    expect(box!.height).toBeLessThan(420);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("Admin Placement results display full data, fallback WhatsApp, 0/100 scores, filterunfinished, and empty/error states across 390px and 1440px", async ({ page }) => {
  const leads = [
    { id: 101, date: "2026-10-04T11:56:00Z", completed_at: "2026-10-04T11:58:00Z", name: "Siswa Lengkap", whatsapp: "081234567890", whatsapp_consent: true, target: "N2", score: 100, recommended_level: "N1", recommended_program: { code: "n1", title: "JLPT N1", path: "/program?level=n1" }, attempt_status: "completed", status: "new" as "new" | "contacted" },
    { id: 102, date: "2026-10-04T11:50:00Z", completed_at: "2026-10-04T11:52:00Z", name: "Tamu Tanpa WA", whatsapp: "", whatsapp_consent: false, target: "N5", score: 0, recommended_level: "N5", recommended_program: null, attempt_status: "completed", status: "contacted" as "new" | "contacted" },
    { id: 103, date: "2026-10-04T11:59:00Z", completed_at: null, name: "Belum Submit", whatsapp: "08999999999", whatsapp_consent: true, target: "N4", score: null, recommended_level: null, recommended_program: null, attempt_status: "in_progress", status: "new" as "new" | "contacted" },
  ];
  let mode: "data" | "empty" | "error" = "data";

  await page.route("**/api/admin/placement-configs", route => route.fulfill({ json: { data: [{ id: 7, title: "Placement", intro_heading: "Intro", duration_minutes: 7, description: "Desc", status: "draft" }] } }));
  await page.route("**/api/admin/placement-questions**", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/admin/placement-leads**", async route => {
    const req = route.request();
    if (req.method() === "PATCH") {
      const id = Number(new URL(req.url()).pathname.split("/").at(-1));
      const body = req.postDataJSON();
      const target = leads.find(item => item.id === id);
      if (target) target.status = body.status;
      await route.fulfill({ json: { data: { id, status: body.status } } });
      return;
    }
    if (mode === "error") {
      await route.fulfill({ status: 500, json: { message: "Gagal memuat hasil placement." } });
      return;
    }
    await route.fulfill({ json: { data: mode === "empty" ? [] : leads } });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/placement-hasil");
  const table = page.getByRole("region", { name: "Data Hasil Placement Test" });
  await expect(table).toContainText("Siswa Lengkap");
  await expect(table).toContainText("081234567890");
  await expect(table).toContainText("100%");
  await expect(table).toContainText("N1");
  await expect(table).toContainText("JLPT N1");
  await expect(table).toContainText("Tamu Tanpa WA");
  await expect(table).toContainText("Belum tersedia");
  await expect(table).toContainText("0%");
  await expect(table).not.toContainText("Belum Submit");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const row = page.getByRole("row", { name: /Siswa Lengkap/ });
  await row.getByRole("button", { name: "Detail", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Detail Hasil Placement" });
  await expect(dialog).toContainText("Siswa Lengkap");
  await expect(dialog).toContainText("081234567890");
  await expect(dialog).toContainText("100%");
  await expect(dialog).toContainText("JLPT N1");
  await dialog.getByRole("button", { name: "Tandai Dihubungi", exact: true }).click();
  await expect(dialog).toContainText("Sudah Dihubungi");
  await dialog.getByRole("button", { name: "Tutup", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  mode = "empty";
  await page.reload();
  await expect(page.getByText("Belum ada hasil Placement selesai.")).toBeVisible();

  mode = "error";
  await page.reload();
  await expect(page.getByText("Data gagal dimuat.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
