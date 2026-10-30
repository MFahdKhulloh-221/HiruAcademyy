import { test, expect } from "./canonical-fixture";
import { formatProgramPrice } from "../src/lib/format-program-price";

for (const width of [1440, 768, 390]) {
  test(`compact summary follows API selection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const programs = ["n5", "n4"].map(code => ({ code, slug: code, name: `JLPT ${code.toUpperCase()}`, family: "jlpt", description: `Deskripsi API ${code}` }));
    const offers = programs.flatMap((program, index) => ["lms", "sensei"].map(plan_code => ({ program, plan_code, base_price: 200000 + index * 100000, effective_price: 180000 + index * 90000, discount_percent: 10, duration_months: plan_code === "lms" ? 6 : 1 })));
    await page.route(/\/api\/public\/(programs|offers)$/, route => route.fulfill({ json: { data: route.request().url().endsWith("programs") ? programs : offers } }));
    await page.goto("/program?level=N5&plan=lms");
    const summary = page.getByRole("complementary", { name: "Ringkasan pilihan program dan paket" });
    await expect(page.getByRole("heading", { name: "Ringkasan Pilihan", exact: true })).toHaveCount(1);
    await expect(summary).toContainText(formatProgramPrice(180000));
    await page.getByRole("button", { name: "Pilih JLPT N4", exact: true }).click();
    await page.getByRole("button", { name: "Pilih Bersama Sensei", exact: true }).click();
    await expect(summary).toContainText("JLPT N4");
    await expect(summary).toContainText("Kelas bersama Sensei");
    await expect(summary).toContainText("Deskripsi API n4");
    await expect(summary).toContainText(formatProgramPrice(270000));
    await expect(summary).toContainText(formatProgramPrice(300000));
    await expect(summary).toContainText("1 bulan");
    await expect(summary.getByRole("link", { name: "Lanjutkan ke Checkout" })).toHaveAttribute("href", "/checkout?program=n4&plan=sensei");
    const columns = await summary.locator(".summary-card-inner").evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width < 640 ? 1 : 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.route(/\/api\/me$/, route => route.fulfill({ status: 401, json: { message: "Unauthenticated." } }));
    await page.reload();
    await expect(summary.getByRole("link", { name: "Lanjutkan Pendaftaran" })).toHaveAttribute("href", "/register?program=n5&plan=lms");
    await page.getByRole("button", { name: "Pilih Coba Gratis", exact: true }).click();
    await expect(page).toHaveURL(/\/program\?level=N5&plan=lms$/);
    await expect(summary).toContainText("Coba Gratis");
    await expect(summary).toContainText("Rp0");
    await expect(summary.getByRole("link", { name: "Lanjutkan Pendaftaran" })).toHaveAttribute("href", "/register?program=n5&plan=free");
    await page.route(/\/api\/public\/offers$/, route => route.fulfill({ json: { data: [] } }));
    await page.reload();
    await expect(summary.getByRole("button", { name: "Paket belum tersedia", exact: true })).toBeDisabled();
    await expect(summary.getByRole("link")).toHaveCount(0);
  });
}
