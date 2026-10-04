import { expect, test } from "@playwright/test";

test("public content uses empty API responses without fixtures", async ({ page }) => {
  await page.route("**/api/blog", route => route.fulfill({ headers: { "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": "true" }, json: { data: [] } }));
  await page.route("**/api/testimonials", route => route.fulfill({ headers: { "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": "true" }, json: { data: [] } }));
  await page.route("**/api/sensei-profiles", route => route.fulfill({ headers: { "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": "true" }, json: { data: [] } }));
  const request = page.waitForRequest("**/api/blog", { timeout: 5000 });
  await page.goto("/blog");
  await request;
  await expect(page.getByText("Artikel tidak ditemukan.")).toBeVisible();
  await expect(page.locator(".blog-card")).toHaveCount(0);
  await page.goto("/testimoni");
  await expect(page.getByText("Belum ada testimoni.")).toBeVisible();
  await expect(page.locator(".testimonial-card")).toHaveCount(0);
  await page.goto("/sensei");
  await expect(page.getByText("Belum ada profil Sensei aktif.")).toBeVisible();
  await expect(page.locator(".sensei-card")).toHaveCount(0);
});

test("public blog exposes API failure and retry", async ({ page }) => {
  await page.route("**/api/blog", route => route.fulfill({ status: 503, json: {} }));
  await page.goto("/blog");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Permintaan belum berhasil.");
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
  await expect(page.locator(".blog-card")).toHaveCount(0);
});
