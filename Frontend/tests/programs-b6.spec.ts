import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`B6 dynamic programs and offers ${width}px, API mocked`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const programs = [
      ...[5, 4, 3, 2, 1].map(level => ({ code: `n${level}`, slug: `jlpt-n${level}`, name: `JLPT N${level}`, description: `Belajar N${level}`, family: "jlpt", status: "active" })),
      { code: "ssw-food", slug: "ssw-pengolahan-makanan", name: "SSW Pengolahan Makanan", description: "Persiapan pengolahan makanan", family: "ssw", status: "active" },
      { code: "interview", slug: "interview", name: "Interview", description: "Latihan wawancara", family: "interview", status: "active" },
      { code: "baru", slug: "program-baru", name: "Program Baru", description: "Deskripsi baru", family: "interview", status: "draft" },
      { code: "lama", slug: "program-lama", name: "Program Lama", description: "Nonaktif", family: "ssw", status: "inactive" },
    ];
    const offers = ["n5", "ssw-food"].map(code => ({ program: programs.find(item => item.code === code), plan_code: "lms", base_price: code === "n5" ? 110000 : 275000, effective_price: code === "n5" ? 110000 : 275000, duration_months: 3, discount_percent: 0, currency: "IDR" }));
    let fail = false;
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/me") return route.fulfill({ status: 401, json: {} });
      if (path === "/api/public/programs") return fail ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: { data: programs.filter(item => item.status === "active") } });
      return route.fulfill({ json: { data: path === "/api/public/offers" ? offers : [] } });
    });
    await page.goto("/program");
    for (const level of [5, 4, 3, 2, 1]) await expect(page.getByRole("button", { name: `Pilih JLPT N${level}`, exact: true })).toBeVisible();
    await expect(page.locator(".public-levels .pricing-features")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Belum tahu levelmu?", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tes Level Gratis", exact: true })).toHaveAttribute("href", "/placement");
    const others = page.getByRole("region", { name: "Program Lainnya", exact: true });
    await expect(others.locator("article")).toHaveCount(2);
    await expect(others).not.toContainText("Program Baru");
    await expect(others).not.toContainText("Program Lama");
    await page.getByRole("button", { name: "Pilih JLPT N4", exact: true }).click();
    await expect(page.locator("#program-pricing")).toContainText("Pilih metode belajar — JLPT N4");
    const sswCard = others.locator("article").filter({ has: page.getByRole("heading", { name: "SSW Pengolahan Makanan", exact: true }) });
    await sswCard.hover();
    await expect(sswCard).toHaveCSS("border-top-color", "rgb(244, 130, 32)");
    await others.getByRole("button", { name: "Pilih kartu SSW Pengolahan Makanan", exact: true }).click();
    await expect(sswCard).toHaveClass(/selected/);
    await expect(sswCard.getByText("Dipilih", { exact: true })).toBeVisible();
    const sswButton = others.getByRole("button", { name: "Pilih SSW Pengolahan Makanan", exact: true });
    await expect(sswButton).toHaveAttribute("aria-pressed", "true");
    await expect(sswButton).toHaveCSS("background-color", "rgb(244, 130, 32)");
    await sswButton.click();
    await expect(page).toHaveURL(/\/program\?program=ssw-food#program-pricing$/);
    const pricing = page.locator("#program-pricing");
    await expect(pricing).toContainText("SSW Pengolahan Makanan");
    await expect(pricing).toContainText("Rp275K");
    await expect(pricing).not.toContainText("Rp110K");
    await expect(pricing.locator(".pricing-card")).toHaveCount(1);
    await expect(pricing.locator(".pricing-title")).toHaveText("LMS のみ (Only)");
    await expect(pricing.locator(".pricing-subtitle")).toHaveText("Belajar Mandiri");
    await pricing.getByRole("button", { name: "Pilih Mandiri", exact: true }).click();
    await expect(pricing.locator(".pricing-card")).toHaveClass(/selected-pricing-card/);
    await expect(page.locator("#program-summary").getByRole("link", { name: "Lanjutkan Pendaftaran" })).toHaveAttribute("href", "/register?program=ssw-food&plan=lms");
    await others.getByRole("button", { name: "Pilih Interview", exact: true }).click();
    await expect(pricing).toContainText("Pilih metode belajar — Interview");
    await expect(pricing).toContainText("Paket program ini belum tersedia.");
    await expect(pricing.locator(".pricing-card")).toHaveCount(0);
    await expect(page.locator("#program-summary a")).toHaveCount(0);
    await page.goto("/program/interview?plan=free");
    await expect(page.locator("#program-summary")).toContainText("Paket belum tersedia");
    await expect(page.locator("#program-summary a")).toHaveCount(0);
    // Simulate public API after Admin activation/edit; not a database persistence test.
    programs[7].status = "active";
    programs[7].name = "Program Baru Aktif";
    programs[7].description = "Deskripsi diperbarui";
    await page.goto("/program");
    await expect(others.locator("article")).toHaveCount(3);
    await expect(others).toContainText("Deskripsi diperbarui");
    await others.getByRole("button", { name: "Pilih Program Baru Aktif", exact: true }).click();
    await expect(page).toHaveURL(/\/program\?program=baru#program-pricing$/);
    await expect(pricing).toContainText("Pilih metode belajar — Program Baru Aktif");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    programs[7].status = "inactive";
    await page.reload();
    await expect(page.getByRole("heading", { name: "Program tidak tersedia", exact: true })).toBeVisible();
    fail = true;
    await page.goto("/program");
    await expect(page.getByRole("alert").filter({ has: page.getByRole("button", { name: "Coba lagi", exact: true }) })).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
    await expect(others.locator("article")).toHaveCount(2);
    await page.screenshot({ path: `test-results/program-b6-${width}.png`, fullPage: true });
    programs.filter(item => item.family !== "jlpt").forEach(item => { item.status = "inactive"; });
    await page.reload();
    await expect(page.getByRole("button", { name: "Pilih JLPT N5", exact: true })).toBeVisible();
    await expect(others).toHaveCount(0);
  });
}
