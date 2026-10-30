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
