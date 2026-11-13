import { expect, test } from "@playwright/test";

// URL state uses actual Program UI; no destination HTML stubs.
test("F2B unavailable and unknown requested choices fail closed — mock API", async ({ page }) => {
  const writes: string[] = [];
  let available = false;
  page.on("request", request => { if (request.url().includes("/api/") && !["GET", "OPTIONS"].includes(request.method())) writes.push(request.url()); });
  await page.route(/\/api\//, route => {
    const path = new URL(route.request().url()).pathname;
    const program = { code: "n4", slug: "n4", name: "JLPT N4", family: "jlpt" };
    return route.fulfill({ status: path === "/api/me" ? 401 : 200, json: { data: path === "/api/public/programs" ? available ? [program] : [] : [] } });
  });
  await page.goto("/program?program=n4&plan=sensei");
  await expect(page.getByRole("heading", { name: "Program tidak tersedia" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Lanjut|Daftar/ })).toHaveCount(0);
  available = true;
  for (const plan of ["sensei", "unknown"]) {
    await page.goto(`/program?program=n4&plan=${plan}`);
    const summary = page.getByRole("complementary", { name: "Ringkasan pilihan program dan paket" });
    await expect(summary.getByRole("link")).toHaveCount(0);
    await expect(summary.getByRole("button", { name: "Paket belum tersedia" })).toBeDisabled();
  }
  await page.goto("/program?program=unknown&plan=free");
  await expect(page.getByRole("heading", { name: "Program tidak tersedia" })).toBeVisible();
  expect(writes).toEqual([]);
});
