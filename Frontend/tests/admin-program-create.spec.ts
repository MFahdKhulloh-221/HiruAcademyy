import { expect, test } from "./canonical-fixture";
import type { Offer } from "../src/lib/commercial-api";

for (const plan of ["lms", "sensei"] as const) {
  test(`new ${plan} program submits explicit pricing and appears as draft with inactive offer`, async ({ page }) => {
    const programs: Record<string, unknown>[] = [];
    const offers: Offer[] = [];
    const writes: unknown[] = [];
    await page.route("**/api/admin/programs", async route => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        writes.push(body);
        const program = { id: 90, ...body, code: body.slug, family: "interview", status: "draft" };
        programs.push(program);
        // Mock persisted contract only; atomicity/status enforcement is covered by Laravel tests.
        offers.push({ id: 91, program_id: 90, program: { code: body.slug, slug: body.slug, name: body.name }, plan_code: body.plan_code, duration_months: body.duration_months, base_price: body.base_price, effective_price: body.base_price, discount_amount: 0, discount_percent: 0, status: "inactive", program_status: "draft" });
        await route.fulfill({ status: 201, json: { data: program } });
        return;
      }
      await route.fulfill({ json: { data: programs } });
    });
    await page.route("**/api/admin/offers", route => route.fulfill({ json: { data: offers } }));
    await page.route("**/api/admin/promotions", route => route.fulfill({ json: { data: [] } }));

    await page.goto("/admin/kurikulum-materi?tab=Program");
    await page.getByRole("button", { name: "+ Tambah Program", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Tambah Program", exact: true });
    await dialog.getByLabel("Nama program", { exact: true }).fill(`Custom ${plan}`);
    await dialog.getByLabel("Deskripsi / informasi program", { exact: true }).fill("Program regression");
    const packageInput = dialog.getByRole("combobox", { name: "Paket", exact: true });
    const duration = dialog.getByLabel("Durasi (bulan)", { exact: true });
    const price = dialog.getByLabel("Harga dasar (IDR)", { exact: true });
    await expect(packageInput).toHaveValue("");
    await expect(duration).toHaveValue("");
    await expect(price).toHaveValue("");
    for (const input of [packageInput, duration, price]) await expect(input).toHaveAttribute("required", "");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toBeVisible();
    expect(writes).toEqual([]);
    await packageInput.selectOption(plan);
    await duration.fill("7");
    await price.fill("123456");
    await expect(dialog.getByRole("combobox", { name: "Status", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes).toEqual([{ name: `Custom ${plan}`, description: "Program regression", sort_order: 1, slug: expect.stringMatching(new RegExp(`^custom-${plan}-[0-9a-f-]{36}$`)), plan_code: plan, duration_months: 7, base_price: 123456 }]);
    await expect(page.getByRole("table", { name: "Daftar Program" }).getByRole("row").filter({ hasText: `Custom ${plan}` })).toContainText("Draft");

    await page.goto("/admin/program-harga");
    const row = page.getByRole("table", { name: "Harga dan pratinjau promo" }).getByRole("row").filter({ hasText: `Custom ${plan}` });
    await expect(row).toContainText("Journey: Draft");
    await expect(row).toContainText(plan === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei");
    await expect(row).toContainText("7 bulan");
    await expect(row).toContainText("Rp123,456K");
    await expect(row.getByRole("combobox")).toHaveValue("inactive");
    await expect(row.getByRole("button", { name: /^Edit Harga/ })).toBeVisible();
    expect(writes).toHaveLength(1);
  });
}
