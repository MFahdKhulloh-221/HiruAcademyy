import { expect, test } from "./canonical-fixture";

test("edit program exposes persisted package and supports Sensei and free preview", async ({ page }) => {
  const program = { id: 90, name: "SSW", slug: "ssw", family: "ssw", status: "active", sort_order: 0, show_on_programs: true, free_preview: false };
  let offer = { id: 91, program_id: 90, plan_code: "lms", duration_months: 6, base_price: 123456, status: "active" };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [program] } }));
  await page.route("**/api/admin/offers", route => route.fulfill({ json: { data: [offer] } }));
  await page.route("**/api/admin/programs/90", route => {
    const body = route.request().postDataJSON();
    writes.push(body);
    program.free_preview = body.plan_code === "free";
    if (!program.free_preview) offer = { ...offer, ...body };
    return route.fulfill({ json: { data: program } });
  });
  await page.goto("/admin/kurikulum-materi?tab=Program");
  await page.getByRole("button", { name: "Edit program SSW", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Program", exact: true });
  await expect(dialog.getByRole("combobox", { name: "Paket", exact: true })).toHaveValue("lms");
  await expect(dialog.getByLabel("Durasi (bulan)")).toHaveValue("6");
  await expect(dialog.getByLabel("Harga dasar (IDR)")).toHaveValue("123456");
  await dialog.getByRole("combobox", { name: "Paket", exact: true }).selectOption("sensei");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0]).toMatchObject({ plan_code: "sensei", duration_months: 6, base_price: 123456 });
  await page.getByRole("button", { name: "Edit program SSW", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Paket", exact: true })).toHaveValue("sensei");
  await dialog.getByRole("combobox", { name: "Paket", exact: true }).selectOption("free");
  await expect(dialog.getByLabel("Durasi (bulan)")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[1]).toMatchObject({ plan_code: "free" });
  expect(writes[1]).not.toHaveProperty("base_price");
});
