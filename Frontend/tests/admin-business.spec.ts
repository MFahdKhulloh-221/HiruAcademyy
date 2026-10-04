import { expect, test, type Page } from "./canonical-fixture";

const BUSINESS_STORAGE_KEY = "hiru-admin-business:v1";

async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    body: document.body.scrollWidth <= document.body.clientWidth,
    page: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  }));
  expect(result).toEqual({ body: true, page: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.removeItem(key), BUSINESS_STORAGE_KEY);
});

test("Scenario A — INVOICE CREATION: checkout creates invoice, redirects to /invoice with id, appears in /admin/invoice", async ({ page }) => {
  await page.goto("/checkout?level=n4&plan=lms");
  await expect(page.getByRole("heading", { name: "Periksa pilihan sebelum membuat invoice" })).toBeVisible();

  const submitBtn = page.getByRole("button", { name: /Buat Invoice/ });
  await expect(submitBtn).toBeVisible();
  await submitBtn.click();

  await page.waitForURL(/\/invoice\?id=/);
  const url = new URL(page.url());
  const invoiceId = url.searchParams.get("id");
  expect(invoiceId).toBeTruthy();

  await page.goto("/admin/invoice");
  await expect(page.getByRole("heading", { name: "Invoice", exact: true })).toBeVisible();

  const row = page.locator("tr", { hasText: invoiceId! });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Menunggu Pembayaran");
  await expect(row).toContainText("N4");
  await expect(row).toContainText("Belajar Mandiri");
});

test("Scenario B — WHATSAPP: inspect 'Buka WhatsApp' href starts with https://wa.me/, status remains 'Menunggu pembayaran'", async ({ page }) => {
  const invoice = { id: 42, user_id: 901, program_id: 2, program_code: "n4", plan_code: "lms", base_price: 99000, total_price: 99000, discount_amount: 0, status: "awaiting_payment", created_at: "2026-10-01T00:00:00Z" };
  let writes = 0;
  await page.route("**/api/admin/settings", route => route.fulfill({ json: { data: { contact: { whatsappNumber: "6289876543210" } } } }));
  await page.route("**/api/admin/invoices**", route => { if (route.request().method() !== "GET") writes++; return route.fulfill({ json: { data: route.request().url().endsWith("/42") ? invoice : [invoice] } }); });
  await page.goto("/admin/invoice");
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "42", exact: true }) });
  await expect(row).toContainText("Menunggu Pembayaran");
  await row.getByRole("button", { name: "Detail" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Menunggu Pembayaran");

  const waLink = page.getByRole("link", { name: /Buka WhatsApp/ });
  await expect(waLink).toBeVisible();
  const href = await waLink.getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\//);

  await expect(dialog).toContainText("Menunggu Pembayaran");
  expect(writes).toBe(0);
  expect(invoice.status).toBe("awaiting_payment");
  await expect(dialog.getByText("Membership Siswa Aktif")).toHaveCount(0);
});

test("Scenario C — canonical adjacent invoice transitions persist on reload", async ({ page }) => {
  const invoice = { id: 42, user_id: 901, program_id: 2, program_code: "n4", plan_code: "lms", base_price: 99000, total_price: 99000, discount_amount: 0, status: "awaiting_payment", created_at: "2026-10-01T00:00:00Z" };
  const transitions: string[] = [];
  await page.route("**/api/admin/invoices**", route => {
    if (route.request().method() === "POST") { const status = route.request().postDataJSON().status; expect(status).toBe(({ awaiting_payment: "paid", paid: "verified", verified: "active" } as Record<string, string>)[invoice.status]); transitions.push(status); invoice.status = status; }
    return route.fulfill({ json: { data: route.request().url().endsWith("/invoices") ? [invoice] : invoice } });
  });
  await page.goto("/admin/invoice");
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "42", exact: true }) });
  for (const label of ["Sudah Bayar", "Diverifikasi", "Aktif"]) {
    await row.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Konfirmasi", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row).toContainText(label);
  }
  await page.reload();
  await expect(row).toContainText("Aktif");
  expect(transitions).toEqual(["paid", "verified", "active"]);
  await expect(row.getByRole("button", { name: "Aktif", exact: true })).toHaveCount(0);
});

test("Scenario D — MEMBERSHIP ACTIVATION: N4 Belajar Mandiri activated, access shows DASAR, N5, N4 available; N3, N2, SSW, Interview locked", async ({ page }) => {
  await page.route("**/api/admin/users", route => route.fulfill({ json: { data: [{ id: 7, name: "Siswa N4 Mandiri", email: "mandiri.n4@example.test", whatsapp: "6281999000012", account_status: "active" }] } }));
  await page.route("**/api/admin/users/7/access", route => route.fulfill({ json: { data: [{ id: 11, program_id: 2, plan_code: "lms", starts_at: "2026-10-01", ends_at: "2027-03-31", status: "active", source_invoice_id: 42 }] } }));
  await page.route("**/api/admin/users/7/effective-access", route => route.fulfill({ json: { data: { learning: { dasar: "full", n5: "full", n4: "full", n3: "preview", n2: "preview", "ssw-food": "none", interview: "none" }, replay_levels: [], source_grants: [] } } }));
  await page.goto("/admin/pengguna-akses");
  await page.getByRole("row").filter({ hasText: "Siswa N4 Mandiri" }).getByRole("button", { name: "Detail", exact: true }).click();
  const accessTable = page.getByRole("table", { name: "Akses efektif", exact: true });
  for (const code of ["DASAR", "N5", "N4"]) await expect(accessTable.getByRole("row").filter({ has: page.getByRole("cell", { name: code, exact: true }) })).toContainText("Akses penuh");
  for (const code of ["N3", "N2"]) await expect(accessTable.getByRole("row").filter({ has: page.getByRole("cell", { name: code, exact: true }) })).toContainText("Preview Chapter 1");
  for (const code of ["SSW", "INTERVIEW"]) await expect(accessTable.getByRole("row").filter({ has: page.getByRole("cell", { name: code, exact: true }) })).toContainText("Terkunci");
});

test("Scenario E — Sensei grant projects cumulative replay without changing student role", async ({ page }) => {
  await page.route("**/api/admin/users", route => route.fulfill({ json: { data: [{ id: 7, name: "Siswa N4 Sensei", email: "sensei@example.test", whatsapp: "6281999000012", account_status: "active", role: "student" }] } }));
  await page.route("**/api/admin/users/7/access", route => route.fulfill({ json: { data: [{ id: 11, program_id: 2, plan_code: "sensei", starts_at: "2026-10-01", ends_at: "2026-10-31", status: "active" }] } }));
  await page.route("**/api/admin/users/7/effective-access", route => route.fulfill({ json: { data: { learning: { dasar: "full", n5: "full", n4: "full", n3: "preview" }, replay_levels: ["n5", "n4"], source_grants: [{ plan_code: "sensei", program_code: "n4" }] } } }));
  await page.goto("/admin/pengguna-akses");
  await page.getByRole("row").filter({ hasText: "Siswa N4 Sensei" }).getByRole("button", { name: "Detail", exact: true }).click();
  await expect(page.getByRole("table", { name: "Riwayat akses program" })).toContainText("Kelas bersama Sensei");
  const table = page.getByRole("table", { name: "Akses efektif", exact: true });
  for (const code of ["N5", "N4"]) await expect(table.getByRole("row").filter({ has: page.getByRole("cell", { name: code, exact: true }) })).toContainText("Akses Replay");
  await expect(table.getByRole("row").filter({ has: page.getByRole("cell", { name: "N3", exact: true }) })).not.toContainText("Akses Replay");
});

test("Scenario F — canonical verified invoice attribution creates one commission and survives reload", async ({ page }) => {
  const commissions: Record<string, unknown>[] = [];
  await page.route("**/api/admin/affiliates", route => route.fulfill({ json: { data: [{ id: 7, name: "Partner", code: "HIRU-PARTNER", rate: 10, status: "active" }] } }));
  await page.route("**/api/admin/invoices", route => route.fulfill({ json: { data: [{ id: 42, status: "verified", total_price: 99000 }] } }));
  await page.route("**/api/admin/invoices/42/affiliate-attribution", route => { expect(route.request().postDataJSON()).toEqual({ affiliate_id: 7 }); return route.fulfill({ json: { data: { invoice_id: 42, affiliate_id: 7 } } }); });
  await page.route("**/api/admin/commissions", async route => {
    if (route.request().method() === "POST") { expect(route.request().postDataJSON()).toEqual({ invoice_id: 42, affiliate_id: 7 }); if (!commissions.length) commissions.push({ id: 11, invoice_id: 42, affiliate_id: 7, amount: 9900, status: "pending" }); await route.fulfill({ status: 201, json: { data: commissions[0] } }); return; }
    await route.fulfill({ json: { data: commissions } });
  });
  await page.goto("/admin/affiliate-komisi");
  await page.getByRole("tab", { name: "Komisi", exact: true }).click();
  await page.getByRole("combobox", { name: /^Invoice/ }).selectOption("42");
  await page.getByRole("combobox", { name: /^Affiliate/ }).selectOption("7");
  await page.getByRole("button", { name: "Simpan Relasi", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "HIRU-PARTNER" });
  await expect(row).toContainText("42");
  await expect(row).toContainText("9.900");
  await page.reload();
  await page.getByRole("tab", { name: "Komisi", exact: true }).click();
  await expect(row).toHaveCount(1);
  expect(commissions).toHaveLength(1);
});

test("Scenario G — settlement excludes pending and paid snapshots and has no wallet amount authority", async ({ page }) => {
  await page.route("**/api/admin/commissions", route => route.fulfill({ json: { data: [{ id: 1, affiliate_id: 7, amount: 1000, status: "pending" }, { id: 2, affiliate_id: 7, amount: 2000, status: "paid" }] } }));
  await page.route("**/api/admin/payouts", route => route.fulfill({ json: { data: [{ id: 42, affiliate_id: 7, amount: 2000, paid_at: "2026-10-01" }] } }));
  await page.goto("/admin/pencairan-komisi");
  await expect(page.getByRole("row").filter({ hasText: "42" })).toContainText("Sudah Dicairkan");
  await page.getByRole("button", { name: "Tambah Pencairan" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Tandai Sudah Dicairkan" })).toBeDisabled();
});

test("Scenario H — canonical affiliate percentage rate persists without rewriting commission snapshots", async ({ page }) => {
  const affiliate = { id: 7, name: "Partner", code: "PARTNER", email: "partner@example.test", whatsapp: "6281999000012", rate: 10, status: "active" };
  const commission = { id: 11, invoice_id: 42, affiliate_id: 7, amount: 9900, status: "pending" };
  await page.route("**/api/admin/affiliates**", async route => {
    if (route.request().method() === "PATCH") Object.assign(affiliate, route.request().postDataJSON());
    await route.fulfill({ json: { data: route.request().url().endsWith("/7") ? affiliate : [affiliate] } });
  });
  await page.route("**/api/admin/commissions", route => route.fulfill({ json: { data: [commission] } }));
  await page.goto("/admin/affiliate-komisi");
  await page.getByRole("row").filter({ hasText: "PARTNER" }).getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Komisi (%)", { exact: true }).fill("15");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: "PARTNER" })).toContainText("15");
  expect(commission.amount).toBe(9900);
});

test("Scenario I — query cannot override canonical server membership", async ({ page }) => {
  await page.route("**/api/public/programs", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/student/access", route => route.fulfill({ json: { data: { learning: {}, replay_levels: [], source_grants: [] } } }));
  for (const membership of ["free", "lms", "sensei"]) {
    await page.goto(`/dashboard?membership=${membership}`);
    await expect(page.locator(".dash-topbar").getByText("Free Member", { exact: true })).toBeVisible();
    await expect(page.locator(".dash-topbar").getByText("Belajar Mandiri", { exact: true })).toHaveCount(0);
  }
});

const responsiveWidths = [360, 390, 768, 820, 1024, 1440];
const adminBusinessRoutes = [
  "/admin/invoice",
  "/admin/pengguna-akses",
  "/admin/affiliate-komisi",
  "/admin/pencairan-komisi",
];

for (const width of responsiveWidths) {
  for (const route of adminBusinessRoutes) {
    test(`Scenario J — Responsive viewport ${route} at ${width}px has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(route);
      await expectNoHorizontalOverflow(page);
    });
  }
}
