import { expect, test, type Page } from "./canonical-fixture";

const responsiveWidths = [360, 390, 768, 820, 1024, 1440];

async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    body: document.body.scrollWidth <= document.body.clientWidth,
    page: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  }));
  expect(result).toEqual({ body: true, page: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.removeItem("hiru-admin-settings:v1");
    localStorage.removeItem("hiru-admin-business:v1");
    localStorage.removeItem("hiru-admin-assessments:v1");
    localStorage.removeItem("hiru-admin-curriculum:v1");
    localStorage.removeItem("hiru-admin-website:v1");
  });
});

test.describe("1. Analytics Dashboard (/admin/analitik)", () => {
  test("loads dedicated dashboard with visible heading", async ({ page }) => {
    await page.goto("/admin/analitik");
    await expect(page.getByRole("heading", { name: "Analitik", level: 1 })).toBeVisible();
    await expect(page.getByText("PANEL ADMIN • ANALITIK")).toBeVisible();
  });

  test("tabs (Ringkasan, Akuisisi, Pembelajaran, Transaksi) change actual content and metrics", async ({ page }) => {
    await page.goto("/admin/analitik");

    // Ringkasan (default active tab)
    await expect(page.getByRole("tab", { name: "Ringkasan" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: "Metrik ringkasan" })).toBeVisible();
    await expect(page.getByText("Total pengguna")).toBeVisible();
    await expect(page.getByText("Membership aktif")).toBeVisible();
    await expect(page.getByText("Invoice perlu tindakan")).toBeVisible();
    await expect(page.getByText("Invoice terverifikasi/aktif")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Status invoice" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "External Analytics" })).toBeVisible();

    // Akuisisi
    await page.getByRole("tab", { name: "Akuisisi" }).click();
    await expect(page.getByRole("tab", { name: "Akuisisi" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Rekomendasi placement" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Target placement" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Status lead placement" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Atribusi referral" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Affiliate — snapshot saat ini" })).toBeVisible();
    await expect(page.getByText("Data placement mengikuti periode")).toBeVisible();

    // Pembelajaran
    await page.getByRole("tab", { name: "Pembelajaran" }).click();
    await expect(page.getByRole("tab", { name: "Pembelajaran" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: "Inventaris pembelajaran" })).toBeVisible();
    await expect(page.getByText("Program terbit")).toBeVisible();
    await expect(page.getByText("Bab terbit")).toBeVisible();
    await expect(page.getByText("Asesmen terbit")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bab per program" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Asesmen per jenis" })).toBeVisible();

    // Transaksi
    await page.getByRole("tab", { name: "Transaksi" }).click();
    await expect(page.getByRole("tab", { name: "Transaksi" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: "Nilai transaksi" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invoice per status" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Komisi per status" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pencairan per status", exact: true })).toBeVisible();
  });

  test("period controls (7 Hari, 30 Hari, Semua) toggle active", async ({ page }) => {
    await page.goto("/admin/analitik");

    const btn7d = page.getByRole("button", { name: "7 Hari" });
    const btn30d = page.getByRole("button", { name: "30 Hari" });
    const btnAll = page.getByRole("button", { name: "Semua" });

    // Initial 30d
    await expect(btn30d).toHaveAttribute("aria-pressed", "true");
    await expect(btn7d).toHaveAttribute("aria-pressed", "false");
    await expect(btnAll).toHaveAttribute("aria-pressed", "false");

    // Toggle 7 Hari
    await btn7d.click();
    await expect(btn7d).toHaveAttribute("aria-pressed", "true");
    await expect(btn30d).toHaveAttribute("aria-pressed", "false");
    await expect(btnAll).toHaveAttribute("aria-pressed", "false");

    // Toggle Semua
    await btnAll.click();
    await expect(btnAll).toHaveAttribute("aria-pressed", "true");
    await expect(btn7d).toHaveAttribute("aria-pressed", "false");
    await expect(btn30d).toHaveAttribute("aria-pressed", "false");
  });

  test("external analytics panel shows GA4 & Meta configuration status with link to /admin/pengaturan-integrasi?tab=Integrasi", async ({ page }) => {
    await page.goto("/admin/analitik");

    await expect(page.getByRole("heading", { name: "External Analytics" })).toBeVisible();
    const externalLink = page.getByRole("link", { name: "Buka Pengaturan Integrasi" });
    await expect(externalLink).toBeVisible();
    await expect(externalLink).toHaveAttribute("href", "/admin/pengaturan-integrasi?tab=Integrasi");

    // Click link and verify navigation to settings with Integrasi tab active
    await externalLink.click();
    await page.waitForURL("/admin/pengaturan-integrasi?tab=Integrasi");
    await expect(page.getByRole("tab", { name: "Integrasi" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Google Analytics 4" })).toBeVisible();
  });

  test("metrics derive from real stores without hardcoded fake visitor/conversion numbers", async ({ page }) => {
    await page.goto("/admin/analitik");

    // Verify absence of fake metrics
    await expect(page.getByText(/pengunjung unik/i)).toHaveCount(0);
    await expect(page.getByText(/conversion rate/i)).toHaveCount(0);
    await expect(page.getByText(/bounce rate/i)).toHaveCount(0);

    // Verify real user count matches business store
    const userCard = page.locator(".admin-metric-card", { hasText: "Total pengguna" });
    await expect(userCard).toBeVisible();
    await expect(userCard.getByRole("paragraph")).toHaveText("Total pengguna");
    await expect(userCard.locator("strong")).toHaveText("1");
  });
});

test.describe("2. Settings & Integrations (/admin/pengaturan-integrasi)", () => {
  test("loads dedicated settings workspace with all tabs", async ({ page }) => {
    await page.goto("/admin/pengaturan-integrasi");
    await expect(page.getByRole("heading", { name: "Pengaturan & Integrasi", level: 1 })).toBeVisible();

    const expectedTabs = ["Umum", "Branding", "Kontak", "Integrasi", "Privasi", "Profil Admin"];
    for (const name of expectedTabs) {
      await expect(page.getByRole("tab", { name })).toBeVisible();
    }

    // Check each tab switches content
    await page.getByRole("tab", { name: "Umum" }).click();
    await expect(page.getByRole("heading", { name: "Pengaturan umum" })).toBeVisible();

    await page.getByRole("tab", { name: "Branding" }).click();
    await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();

    await page.getByRole("tab", { name: "Kontak" }).click();
    await expect(page.getByRole("heading", { name: "Kontak utama" })).toBeVisible();

    await page.getByRole("tab", { name: "Integrasi" }).click();
    await expect(page.getByRole("heading", { name: "Google Analytics 4" })).toBeVisible();

    await page.getByRole("tab", { name: "Privasi" }).click();
    await expect(page.getByRole("heading", { name: "Privasi & persetujuan" })).toBeVisible();

    await page.getByRole("tab", { name: "Profil Admin" }).click();
    await expect(page.getByRole("heading", { name: "Profil admin" })).toBeVisible();
  });

  test("canonical WhatsApp: change WhatsApp in Settings -> Save -> Navigate to /admin/invoice -> verify invoice link", async ({ page }) => {
    await page.goto("/admin/pengaturan-integrasi");
    await page.getByRole("tab", { name: "Kontak" }).click();

    const waInput = page.getByLabel("Nomor WhatsApp");
    await waInput.fill("6289876543210");
    const invoice = { id: 42, user_id: 901, program_id: 2, program_code: "n4", plan_code: "lms", base_price: 99000, discount_amount: 0, total_price: 99000, status: "awaiting_payment", created_at: "2026-10-01T00:00:00Z" };
    await page.route("**/api/admin/invoices", route => route.fulfill({ json: { data: [invoice] } }));
    await page.route("**/api/admin/invoices/42", route => route.fulfill({ json: { data: invoice } }));
    await page.getByRole("button", { name: "Simpan Kontak" }).click();
    await expect(page.getByRole("status")).toHaveText("Pengaturan Kontak berhasil disimpan.");

    // Navigate to /admin/invoice and check detail modal WhatsApp link
    await page.goto("/admin/invoice");
    const firstRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "42", exact: true }) });
    await firstRow.getByRole("button", { name: "Detail" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const waLink = dialog.getByRole("link", { name: /Buka WhatsApp/ });
    await expect(waLink).toBeVisible();
    const href = await waLink.getAttribute("href");
    expect(href).toContain("https://wa.me/6289876543210");
  });

  test("GA4 validation: invalid shows Perlu dilengkapi / validation; valid G-XXXXXXXXXX shows Siap digunakan and persists", async ({ page }) => {
    await page.goto("/admin/pengaturan-integrasi?tab=Integrasi");

    const ga4Card = page.locator(".settings-card", { hasText: "Google Analytics 4" });
    const ga4Checkbox = ga4Card.getByLabel("Aktifkan konfigurasi GA4");
    const ga4Input = ga4Card.getByLabel("Measurement ID");

    // Enable GA4 with invalid ID
    await ga4Checkbox.check();
    await ga4Input.fill("INVALID-ID");
    await expect(ga4Card.locator(".settings-status")).toHaveText("Perlu dilengkapi");

    // Submit shows validation message
    await page.getByRole("button", { name: "Simpan Integrasi" }).click();
    await expect(page.getByText("Measurement ID harus berformat G-XXXXXXXXXX.")).toBeVisible();

    // Enter valid measurement ID
    await ga4Input.fill("G-HIRU2026XX");
    await expect(ga4Card.locator(".settings-status")).toHaveText("Siap digunakan");

    // Save and reload to verify persistence
    await page.getByRole("button", { name: "Simpan Integrasi" }).click();
    await expect(page.getByRole("status")).toHaveText("Pengaturan Integrasi berhasil disimpan.");

    await page.reload();
    const reloadedCard = page.locator(".settings-card", { hasText: "Google Analytics 4" });
    await expect(reloadedCard.locator(".settings-status")).toHaveText("Siap digunakan");
    await expect(reloadedCard.getByLabel("Measurement ID")).toHaveValue("G-HIRU2026XX");
  });

  test("Meta validation: enable with valid pixel ID shows Siap digunakan and persists", async ({ page }) => {
    await page.goto("/admin/pengaturan-integrasi?tab=Integrasi");

    const metaCard = page.locator(".settings-card", { hasText: "Meta Pixel" });
    const metaCheckbox = metaCard.getByLabel("Aktifkan konfigurasi Meta Pixel");
    const metaInput = metaCard.getByLabel("Pixel ID");

    // Enable Meta with invalid ID
    await metaCheckbox.check();
    await metaInput.fill("12");
    await expect(metaCard.locator(".settings-status")).toHaveText("Perlu dilengkapi");

    // Valid pixel ID
    await metaInput.fill("9876543210");
    await expect(metaCard.locator(".settings-status")).toHaveText("Siap digunakan");

    // Save and reload
    await page.getByRole("button", { name: "Simpan Integrasi" }).click();
    await expect(page.getByRole("status")).toHaveText("Pengaturan Integrasi berhasil disimpan.");

    await page.reload();
    const reloadedCard = page.locator(".settings-card", { hasText: "Meta Pixel" });
    await expect(reloadedCard.locator(".settings-status")).toHaveText("Siap digunakan");
    await expect(reloadedCard.getByLabel("Pixel ID")).toHaveValue("9876543210");
  });

  test("meeting provider informational (Manual) and sender config persist", async ({ page }) => {
    await page.goto("/admin/pengaturan-integrasi?tab=Integrasi");

    const providerSelect = page.getByLabel("Penyedia rapat");
    await expect(providerSelect).toHaveValue("Manual");
    await providerSelect.selectOption("Google Meet");

    const senderName = page.getByLabel("Nama pengirim");
    await senderName.fill("Hiru Akademik");

    const senderEmail = page.getByLabel("Email pengirim");
    await senderEmail.fill("pengirim@hiruacademy.com");

    await page.getByRole("button", { name: "Simpan Integrasi" }).click();
    await expect(page.getByRole("status")).toHaveText("Pengaturan Integrasi berhasil disimpan.");

    await page.reload();
    await expect(page.getByLabel("Penyedia rapat")).toHaveValue("Google Meet");
    await expect(page.getByLabel("Nama pengirim")).toHaveValue("Hiru Akademik");
    await expect(page.getByLabel("Email pengirim")).toHaveValue("pengirim@hiruacademy.com");
  });
});

test.describe("4. Responsive Viewports", () => {
  for (const width of responsiveWidths) {
    test(`/admin/analitik has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.goto("/admin/analitik");
      await expectNoHorizontalOverflow(page);
    });

    test(`/admin/pengaturan-integrasi has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.goto("/admin/pengaturan-integrasi");
      await expectNoHorizontalOverflow(page);
    });
  }
});
