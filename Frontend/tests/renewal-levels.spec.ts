import { expect, test } from "./canonical-fixture";

for (const width of [1440, 768, 390]) test(`renewal N5–N1 API offers ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const programs = [5, 4, 3, 2, 1].map((level, id) => ({ id: id + 1, code: `n${level}`, slug: `n${level}`, name: `JLPT N${level}`, family: "jlpt" }));
  const offers = programs.flatMap(program => ["lms", "sensei"].map((plan_code, index) => ({ id: program.id * 10 + index, program_id: program.id, program, plan_code, base_price: 120000 + program.id, effective_price: 110000 + program.id, duration_months: index + 2 })));
  let fail = true;
  let unavailable = false;
  let noGrants = false;
  let selected = offers[0];
  let writes = 0;
  let status = "draft";
  const invoice = () => ({ id: 100, user_id: 901, program_id: selected.program_id, program_code: selected.program.code, plan_code: selected.plan_code, base_price: selected.base_price, discount_amount: 10000, total_price: selected.effective_price, duration_months: selected.duration_months, renewal_grant_id: selected.program_id, status, created_at: "2026-10-28T00:00:00Z" });
  await page.route("**/api/student/dashboard", r => r.fulfill({ json: { data: { programs, chapters: [], access: { learning: Object.fromEntries(programs.map(p => [p.code, noGrants ? "preview" : "full"])), replay_levels: [], source_grants: noGrants ? [] : programs.map(p => ({ program_code: p.code, plan_code: "lms", starts_at: "2026-10-01", ends_at: "2027-03-31" })) } } } }));
  await page.route("**/api/public/programs", r => r.fulfill({ json: { data: programs } }));
  await page.route("**/api/public/offers", r => fail ? r.fulfill({ status: 503, json: { message: "Offers unavailable" } }) : r.fulfill({ json: { data: unavailable ? [] : offers } }));
  await page.route("**/api/student/invoices", async r => {
    if (r.request().method() !== "POST") return r.fallback();
    expect(r.request().postDataJSON()).toEqual({ program_offer_id: selected.id });
    writes++;
    await r.fulfill({ json: { data: invoice() } });
  });
  await page.route("**/api/student/invoices/100**", async r => {
    if (r.request().url().endsWith("/submit")) status = "awaiting_payment";
    await r.fulfill({ json: { data: invoice() } });
  });
  await page.goto("/renewal");
  await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  for (const program of programs) {
    for (const plan of ["lms", "sensei"]) {
      selected = offers.find(o => o.program_id === program.id && o.plan_code === plan)!;
      status = "draft";
      await page.goto(`/renewal?target=${program.code}`);
      await expect(page.locator(".renewal-program-card")).toHaveCount(5);
      await expect(page.getByRole("region", { name: "Membership milik siswa" })).toContainText("2027-03-31");
      await page.locator(".renewal-plan-card").filter({ hasText: plan === "lms" ? "Belajar Mandiri" : "Kelas bersama Sensei" }).click();
      await expect(page.locator(".renewal-summary-card")).toContainText(program.name);
      await expect(page.locator(".renewal-summary-card")).toContainText(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(selected.effective_price));
      await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
      await expect(page.locator(".renewal-summary-card")).toContainText(program.code.toUpperCase());
      await page.getByRole("button", { name: "Buat Invoice", exact: true }).click();
      await expect(page.locator(".renewal-summary-card")).toContainText("Menunggu Pembayaran");
      await expect(page.locator(".renewal-summary-card")).toContainText("Perpanjangan Membership");
      await expect(page.getByRole("button", { name: "Sudah Bayar", exact: true })).toBeVisible();
    }
  }
  expect(writes).toBe(10);
  unavailable = true;
  noGrants = true;
  await page.goto("/renewal?target=n1");
  await expect(page.getByRole("button", { name: "Buat Invoice", exact: true })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Membership milik siswa" })).toContainText("Membership expired diperiksa backend");
  await expect(page.locator(".renewal-plan-card").first()).not.toContainText("99.000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
