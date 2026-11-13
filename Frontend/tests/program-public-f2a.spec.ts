import { expect, test } from "@playwright/test";

for (const width of [1440, 768, 390]) {
  test(`F2A guest states and summary ${width}px — mock API`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const programs = [
      { code: "n5", slug: "jlpt-n5", name: "JLPT N5", family: "jlpt", description: "Program N5 dari API" },
      { code: "ssw-food", slug: "ssw-food", name: "SSW Food", family: "ssw", description: "Program SSW dari API" },
      { code: "interview", slug: "interview", name: "Interview", family: "interview", description: "Program Interview dari API" },
    ];
    let mode = "normal";
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let hold = true;
    const writes: string[] = [];
    await page.route(/\/(api\/|sanctum\/)/, async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") writes.push(path);
      if (path === "/api/me") return route.fulfill({ status: 401, json: {} });
      if (path === "/api/public/programs") {
        if (hold) await pending;
        return route.fulfill({ json: { data: mode === "empty" ? [] : mode === "others" ? programs.slice(1) : programs } });
      }
      if (path === "/api/public/offers") {
        if (mode === "error") return route.fulfill({ status: 503, json: { message: "Harga gagal dimuat" } });
        return route.fulfill({ json: { data: mode === "no-offers" ? [] : programs.map((program, index) => ({ program, plan_code: "lms", base_price: (index + 1) * 100000, effective_price: (index + 1) * 100000, duration_months: index + 2, currency: "IDR", discount_percent: 0 })) } });
      }
      return route.fulfill({ json: { data: [] } });
    });
    await page.goto("/program");
    await expect(page.getByRole("status").filter({ hasText: "Memuat program…" })).toBeVisible();
    hold = false;
    release();
    const summary = page.getByRole("complementary", { name: "Ringkasan pilihan program dan paket" });
    for (const [index, program] of programs.entries()) {
      await page.getByRole("button", { name: `Pilih ${program.name}`, exact: true }).click();
      await expect(summary).toContainText(program.name);
      await expect(summary).toContainText(`${index + 2} bulan`);
      await expect(summary.locator(".pricing-amount")).toContainText(`Rp${index + 1}00K`);
      await expect(summary.getByRole("link")).toHaveAttribute("href", `/register?program=${program.code}&plan=lms`);
      await expect(page).not.toHaveURL(/\/login/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/program-f2a-${width}.png`, fullPage: true });
    mode = "error";
    await page.reload();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Harga belum dapat dimuat.");
    await expect(summary).toHaveCount(0);
    mode = "no-offers";
    await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
    await expect(page.getByText("Paket program ini belum tersedia.", { exact: true })).toBeVisible();
    await expect(summary.getByRole("link")).toHaveCount(0);
    await expect(summary.getByRole("button", { name: "Paket belum tersedia" })).toBeDisabled();
    await page.goto("/program?program=unknown&plan=lms");
    await expect(page.getByRole("heading", { name: "Program tidak tersedia" })).toBeVisible();
    await expect(summary).toHaveCount(0);
    mode = "others";
    await page.goto("/program");
    await expect(page.getByRole("button", { name: "Pilih SSW Food", exact: true })).toBeVisible();
    await expect(page.locator(".level-section")).toHaveCount(0);
    await expect(page.getByRole("main")).not.toContainText("Hiragana");
    mode = "empty";
    await page.reload();
    await expect(page.getByRole("status")).toHaveText("Belum ada program tersedia.");
    await expect(page.locator(".public-level")).toHaveCount(0);
    expect(writes).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
