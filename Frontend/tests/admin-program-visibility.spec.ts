import { expect, test } from "./canonical-fixture";

test("program actions stay compact and visibility does not deactivate program", async ({ page }) => {
  const program = { id: 90, name: "SSW", slug: "ssw", family: "ssw", description: "Persiapan SSW", sort_order: 0, status: "active", show_on_programs: true };
  const writes: unknown[] = [];
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [program] } }));
  await page.route("**/api/admin/programs/90", async route => {
    const body = route.request().postDataJSON();
    writes.push(body);
    Object.assign(program, body);
    await route.fulfill({ json: { data: program } });
  });
  await page.goto("/admin/kurikulum-materi?tab=Program");
  const row = page.getByRole("table", { name: "Daftar Program" }).getByRole("row").filter({ hasText: "Persiapan SSW" });
  await expect(row.getByRole("button")).toHaveCount(2);
  await row.getByRole("checkbox", { name: "Tampilkan SSW di /program", exact: true }).click();
  await expect(row).toContainText("Tersembunyi dari /program");
  await expect(row).toContainText("Aktif");
  expect(writes).toEqual([{ show_on_programs: false }]);
  await row.getByRole("button", { name: "Edit program SSW", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Program", exact: true });
  await expect(dialog.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("active");
  await expect(dialog.getByRole("checkbox", { name: "Tampilkan di /program", exact: true })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await row.getByRole("button", { name: "Hapus program SSW", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Hapus Program?", exact: true });
  const cancel = confirmation.getByRole("button", { name: "Batal", exact: true });
  const remove = confirmation.getByRole("button", { name: "Hapus Permanen", exact: true });
  await expect(cancel).toBeVisible();
  await expect(remove).toBeVisible();
  const bounds = await confirmation.boundingBox();
  for (const button of [cancel, remove]) {
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(100);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  }
  await cancel.click();
  expect(writes).toEqual([{ show_on_programs: false }]);
});
