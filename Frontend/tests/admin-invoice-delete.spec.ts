import { expect, test, type Page } from "@playwright/test";

type Invoice = { id: number; user_id: number; program_id: number; plan_code: string; base_price: number; discount_amount: number; total_price: number; status: string; created_at: string; can_delete?: boolean };
async function setup(page: Page, overrides: Partial<Invoice> = {}) {
  const invoice: Invoice = { id: 71, user_id: 9, program_id: 3, plan_code: "sensei", base_price: 600000, discount_amount: 0, total_price: 600000, status: "awaiting_payment", created_at: "2026-10-12T08:00:00Z", can_delete: true, ...overrides };
  let removed = false;
  const mutations: { method: string; body: unknown }[] = [];
  const archives: boolean[] = [];
  await page.context().addCookies([{ name: "XSRF-TOKEN", value: "test-token", url: "http://localhost:3000" }]);
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204 }));
  await page.route("**/api/me", route => route.fulfill({ json: { data: { id: 1, name: "Admin", email: "admin@example.test", whatsapp: "628123456789", role: "admin" } } }));
  await page.route("**/api/admin/settings", route => route.fulfill({ json: { data: { contact: { whatsappNumber: "6285194564214" } } } }));
  await page.route("**/api/admin/offers", route => route.fulfill({ json: { data: [{ program_id: 3, program: { code: "n3" } }] } }));
  await page.route("**/api/admin/users", route => route.fulfill({ json: { data: [{ id: 9, name: "Pembeli Asli", email: "buyer@example.test" }] } }));
  await page.route(/\/api\/admin\/invoices(?:\?.*)?$/, route => {
    const archived = new URL(route.request().url()).searchParams.get("archived") === "1";
    archives.push(archived);
    return route.fulfill({ json: { data: !removed && archived === (invoice.status === "cancelled") ? [invoice] : [] } });
  });
  await page.route("**/api/admin/invoices/71", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: invoice } });
    mutations.push({ method: route.request().method(), body: route.request().postData() });
    removed = true;
    return route.fulfill({ status: 204 });
  });
  await page.route("**/api/admin/invoices/71/cancel", route => {
    mutations.push({ method: route.request().method(), body: route.request().postDataJSON() });
    invoice.status = "cancelled";
    return route.fulfill({ json: { data: invoice } });
  });
  await page.goto("/admin/invoice");
  await page.getByRole("button", { name: "Detail", exact: true }).click();
  return { mutations, archives };
}

test("delete needs explicit confirmation, displays identity, refreshes only after success", async ({ page }) => {
  const { mutations } = await setup(page);
  const detail = page.getByRole("dialog", { name: "Detail Invoice", exact: true });
  await detail.getByRole("button", { name: "Hapus Invoice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hapus Invoice Permanen?", exact: true });
  for (const value of ["71", "Pembeli Asli", "Rp600.000"]) await expect(dialog.getByText(value, { exact: true })).toBeVisible();
  await expect(dialog).toContainText("tidak dapat dipulihkan");
  await expect(dialog.getByRole("button", { name: "Hapus Permanen", exact: true })).toBeDisabled();
  expect(mutations).toHaveLength(0);
  await dialog.getByRole("checkbox").check();
  expect(mutations).toHaveLength(0);
  await dialog.getByRole("button", { name: "Hapus Permanen", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Invoice berhasil dihapus permanen.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Detail", exact: true })).toHaveCount(0);
  expect(mutations).toEqual([{ method: "DELETE", body: null }]);
});

for (const width of [360, 655, 1440]) {
  test(`delete confirmation stacks content without squeezed columns at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 916 });
    await setup(page);
    await page.getByRole("button", { name: "Hapus Invoice", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Hapus Invoice Permanen?", exact: true });
    const identity = await dialog.locator("dl").boundingBox();
    const warning = await dialog.getByText("Invoice akan dihapus permanen.", { exact: false }).boundingBox();
    const consent = await dialog.getByRole("checkbox").locator("..").boundingBox();
    expect(identity).not.toBeNull();
    expect(warning!.y).toBeGreaterThanOrEqual(identity!.y + identity!.height);
    expect(consent!.y).toBeGreaterThanOrEqual(warning!.y + warning!.height);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await dialog.locator("dd").last().boundingBox())!.width).toBeGreaterThan(100);
  });
}

test("422 keeps invoice and confirmation context with field denial reason", async ({ page }) => {
  await setup(page);
  await page.route("**/api/admin/invoices/71", route => route.fulfill({ status: 422, json: { message: "Validation failed", errors: { invoice: ["Invoice memiliki relasi; batalkan invoice."] } } }));
  await page.getByRole("button", { name: "Hapus Invoice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hapus Invoice Permanen?", exact: true });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Hapus Permanen", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Invoice memiliki relasi; batalkan invoice.");
  await expect(dialog.getByText("Pembeli Asli", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  await dialog.getByRole("button", { name: "Kembali", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Detail Invoice", exact: true })).toContainText("Invoice: 71");
  await expect(page.getByRole("row").filter({ hasText: "Pembeli Asli" })).toHaveCount(1);
});

for (const status of ["paid", "verified", "active", "awaiting_payment"]) {
  test(`${status} with ${status === "awaiting_payment" ? "missing" : "true"} metadata has no destructive action`, async ({ page }) => {
    const { mutations } = await setup(page, { status, can_delete: status === "awaiting_payment" ? undefined : true });
    const dialog = page.getByRole("dialog", { name: "Detail Invoice", exact: true });
    await expect(dialog.getByRole("button", { name: "Hapus Invoice", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Batalkan & Sembunyikan", exact: true })).toHaveCount(0);
    expect(mutations).toHaveLength(0);
  });
}

test("cancel requires reason, preserves archive and independent three-option filter", async ({ page }) => {
  const { mutations, archives } = await setup(page, { can_delete: false });
  await page.getByRole("button", { name: "Batalkan & Sembunyikan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Batalkan & Sembunyikan Invoice?", exact: true });
  await expect(dialog).toContainText("Kredit yang dicadangkan akan dilepas");
  await expect(dialog).toContainText("Riwayat invoice dan audit tetap tersimpan");
  await expect(dialog.getByRole("button", { name: "Konfirmasi Pembatalan", exact: true })).toBeDisabled();
  expect(mutations).toHaveLength(0);
  await dialog.getByLabel("Alasan pembatalan").fill(" Invoice ganda ");
  await dialog.getByRole("button", { name: "Konfirmasi Pembatalan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Invoice dibatalkan dan disembunyikan");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Detail", exact: true })).toHaveCount(0);
  expect(mutations).toEqual([{ method: "POST", body: { reason: "Invoice ganda", confirmation: true } }]);
  const filter = page.getByRole("combobox", { name: "Status", exact: true });
  await expect(filter.locator("option")).toHaveText(["Semua Status", "Menunggu Pembayaran", "Sudah Bayar"]);
  await filter.selectOption("active");
  const archiveBox = page.getByRole("checkbox", { name: "Tampilkan invoice dibatalkan" });
  expect((await archiveBox.boundingBox())?.width).toBeLessThanOrEqual(24);
  await archiveBox.check();
  await expect(page.getByRole("cell", { name: "Dibatalkan", exact: true })).toBeVisible();
  expect(archives).toContain(true);
  await page.getByRole("button", { name: "Detail", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "Detail Invoice", exact: true });
  await expect(detail.getByRole("button", { name: /Hapus Invoice|Batalkan & Sembunyikan|Konfirmasi Sudah Bayar|Menunggu Pembayaran/ })).toHaveCount(0);
  await detail.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.getByRole("checkbox", { name: "Tampilkan invoice dibatalkan" }).uncheck();
  await expect(filter).toHaveValue("active");
  await expect(page.getByRole("button", { name: "Detail", exact: true })).toHaveCount(0);
});
