import { expect, test, type Page } from "@playwright/test";
import { registrationDraftKey, registrationDraftLifetime } from "../src/lib/registration-draft";

async function mockSelection(page: Page, loggedIn = false) {
  await page.context().addCookies([{ name: "XSRF-TOKEN", value: "r02", url: "http://localhost:3000" }]);
  const state = { loggedIn, offersStatus: 200, registerStatus: 201, missing: false, registrations: [] as Record<string, unknown>[] };
  const user = { id: 77, name: "Siswa R02", email: "r02@example.test", whatsapp: "081234567890", role: "student", account_status: "active" };
  const programs = [4, 5].map(level => ({ code: `n${level}`, slug: `n${level}`, name: `JLPT N${level}`, family: "jlpt", description: `Program belajar N${level}` }));
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    if (path === "/api/me") return reply(state.loggedIn ? user : null, state.loggedIn ? 200 : 401);
    if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204 });
    if (path === "/api/auth/login") { state.loggedIn = true; return reply(user); }
    if (path === "/api/auth/register") { state.registrations.push(route.request().postDataJSON()); if (state.registerStatus !== 201) return route.fulfill({ status: state.registerStatus, json: { message: "Periksa email", errors: { email: ["Email sudah dipakai."] } } }); state.loggedIn = true; return reply(user, 201); }
    if (path === "/api/public/programs") return reply(programs);
    if (path === "/api/public/offers") return reply(state.offersStatus !== 200 ? null : programs.flatMap(program => ["sensei", "lms"].filter(plan => !state.missing || plan !== "sensei").map(plan_code => ({ program, plan_code, base_price: plan_code === "sensei" ? 350000 : 250000, effective_price: plan_code === "sensei" ? 350000 : 250000, currency: "IDR", duration_months: plan_code === "sensei" ? 1 : 6, discount_percent: 0 }))), state.offersStatus);
    if (path === "/api/placement/attempts/12") return reply({ id: 12, status: "completed", adaptive: true, questions: [], answers: {}, result: { correct: 8, wrong: 2, unanswered: 0, percentage: 80, total: 10, recommendation_level: "N4", recommended_program: { code: "n4", title: "JLPT N4", path: "/program/n4" }, areas: [] } });
    if (path.includes("invoices")) throw new Error("R02 must not create transactions");
    return reply([]);
  });
  return state;
}

for (const width of [390, 768, 1440]) {
  test(`R02 placement selection to summary and registration ${width}`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    const state = await mockSelection(page);
    await page.goto("/placement/result?attempt=12");
    await page.getByRole("link", { name: "Pilih Kelas bersama Sensei →", exact: true }).click();
    const summary = page.locator("#program-summary");
    await expect(summary).toContainText("JLPT N4");
    await expect(summary).toContainText("Kelas bersama Sensei");
    await expect(summary).toContainText("Rp350K");
    await expect(summary).toContainText("1 bulan");
    await expect(summary.getByRole("heading", { name: "Ringkasan Pilihan" })).toBeInViewport();
    await page.reload();
    await expect(summary).toContainText("Kelas bersama Sensei");
    await summary.getByRole("button", { name: "Ubah Pilihan" }).click();
    await page.locator("#program-pricing").getByRole("button", { name: "Pilih Mandiri", exact: true }).click();
    await expect(summary).toContainText("Belajar Mandiri");
    await expect(summary).toContainText("Rp250K");
    await expect(summary).toContainText("6 bulan");
    await expect(summary).not.toContainText("Rp350K");
    await page.goBack();
    await expect(summary).toContainText("Kelas bersama Sensei");
    await page.goBack();
    await expect(page).toHaveURL(/placement\/result/);
    await page.getByRole("link", { name: "Pilih Belajar Mandiri →", exact: true }).click();
    await expect(summary).toContainText("Belajar Mandiri");
    await expect(summary.getByRole("link", { name: "Lanjutkan Pendaftaran" })).toHaveAttribute("href", "/register?program=n4&plan=lms");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await summary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`summary-r02-${width}.png`) });
    await summary.getByRole("link", { name: "Lanjutkan Pendaftaran" }).click();
    await expect(page.getByLabel("Target Ujian")).toHaveValue("N4");
    await expect(page.getByLabel("Cara Belajar")).toHaveValue("Belajar Mandiri");
    await page.getByLabel("Nama Lengkap").fill("Nama Tetap");
    await page.getByLabel("Email", { exact: true }).fill("r02@example.test");
    await page.getByLabel("Nomor WhatsApp", { exact: true }).fill("081234567890");
    await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("hiru.registration-draft.v1")!));
    expect(Object.keys(stored).sort()).toEqual(["email", "name", "updatedAt", "whatsapp"]);
    expect(JSON.stringify(stored)).not.toContain("password123");
    await page.getByRole("link", { name: "Kembali ke Ringkasan Pilihan" }).click();
    await expect(summary).toContainText("Belajar Mandiri");
    await page.getByRole("button", { name: "Pilih JLPT N5", exact: true }).click();
    await page.locator("#program-pricing").getByRole("button", { name: "Pilih Bersama Sensei", exact: true }).click();
    await expect(summary).toContainText("JLPT N5");
    await summary.getByRole("link", { name: "Lanjutkan Pendaftaran" }).click();
    await expect(page.getByLabel("Target Ujian")).toHaveValue("N5");
    await expect(page.getByLabel("Cara Belajar")).toHaveValue("Belajar dengan Sensei");
    await expect(page.getByLabel("Nama Lengkap")).toHaveValue("Nama Tetap");
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("r02@example.test");
    await expect(page.getByLabel("Nomor WhatsApp", { exact: true })).toHaveValue("081234567890");
    await expect(page.getByLabel("Kata Sandi", { exact: true })).toHaveValue("");
    await page.reload();
    await expect(page.getByLabel("Nama Lengkap")).toHaveValue("Nama Tetap");
    await expect(page.getByLabel("Kata Sandi", { exact: true })).toHaveValue("");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Buat Akun", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`register-r02-${width}.png`) });
    await page.getByRole("link", { name: "Masuk", exact: true }).click();
    await expect(page).toHaveURL(/login\?program=N5&plan=sensei/);
    await page.getByLabel("Email / WhatsApp").fill("r02@example.test");
    await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(summary).toContainText("JLPT N5");
    await expect(summary).toContainText("Kelas bersama Sensei");
    await expect(summary.getByRole("link", { name: "Lanjutkan ke Checkout" })).toHaveAttribute("href", "/checkout?program=n5&plan=sensei");
    expect(state.registrations).toEqual([]);
  });
}

test("R02 missing offers, invalid URL, API retry and registration guard", async ({ page }) => {
  const state = await mockSelection(page);
  state.missing = true;
  await page.goto("/program/n4?plan=sensei");
  const summary = page.locator("#program-summary");
  await expect(summary).toContainText("Paket yang dipilih tidak tersedia");
  await expect(summary.getByRole("link", { name: "Lanjutkan Pendaftaran" })).toHaveCount(0);
  await expect(summary).not.toContainText("Rp250K");
  await page.goto("/register?program=n4&plan=sensei");
  await expect(page.locator("main").getByRole("alert")).toContainText("Pilihan program atau paket tidak tersedia");
  await expect(page.getByRole("button", { name: "Buat Akun" })).toBeDisabled();
  for (const url of ["/program?program=unknown&plan=lms", "/program?plan=sensei"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Program tidak tersedia" })).toBeVisible();
    await expect(summary).toHaveCount(0);
  }
  await page.goto("/program?program=n4&plan=invalid");
  await expect(summary).toContainText("Paket yang dipilih tidak tersedia");
  state.offersStatus = 503;
  await page.goto("/program?program=n4&plan=sensei");
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(summary).toHaveCount(0);
  state.offersStatus = 200;
  state.missing = false;
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(summary).toContainText("Rp350K");
  for (const url of ["/register?program=n4&plan=invalid", "/register?program=n4", "/register?plan=sensei"]) {
    await page.goto(url);
    await expect(page.getByRole("button", { name: "Buat Akun" })).toBeDisabled();
  }
  await page.goto("/program?program=n4&plan=");
  await expect(summary).toContainText("Paket yang dipilih tidak tersedia");
});

test("R02 authenticated user skips registration; guest registration preserves selected checkout identity", async ({ page }) => {
  const state = await mockSelection(page, true);
  await page.goto("/register?program=n4&plan=sensei");
  await expect(page.locator("#program-summary")).toContainText("Kelas bersama Sensei");
  await expect(page.getByRole("link", { name: "Lanjutkan ke Checkout" })).toHaveAttribute("href", "/checkout?program=n4&plan=sensei");
  state.loggedIn = false;
  await page.goto("/register?program=n5&plan=lms");
  await page.getByLabel("Nama Lengkap").fill("Siswa Baru");
  await page.getByLabel("Email", { exact: true }).fill("baru@example.test");
  await page.getByLabel("Nomor WhatsApp", { exact: true }).fill("081234567890");
  await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
  await page.route("**/checkout?**", route => route.fulfill({ contentType: "text/html", body: "<main>Checkout boundary only</main>" }));
  await page.getByRole("button", { name: "Buat Akun", exact: true }).click();
  await expect(page).toHaveURL(/checkout\?program=N5&plan=lms$/);
  expect(await page.evaluate(() => sessionStorage.getItem("hiru.registration-draft.v1"))).toBeNull();
  expect(state.registrations).toHaveLength(1);
  expect(state.registrations[0]).toMatchObject({ name: "Siswa Baru", target_jlpt: "N5" });
});

for (const width of [390, 1440]) {
  test(`registration draft N4 Sensei to N4 Mandiri ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockSelection(page);
    await page.goto("/register?program=n4&plan=sensei");
    await page.getByLabel("Nama Lengkap").fill("Nama Lengkap Persis");
    await page.getByLabel("Email", { exact: true }).fill("persis@example.test");
    await page.getByLabel("Nomor WhatsApp", { exact: true }).fill("+6281234567890");
    await page.getByLabel("Kata Sandi", { exact: true }).fill("never-store-this");
    await page.getByRole("link", { name: "Kembali ke Ringkasan Pilihan" }).click();
    await page.locator("#program-summary").getByRole("button", { name: "Ubah Pilihan" }).click();
    await page.locator("#program-pricing").getByRole("button", { name: "Pilih Mandiri", exact: true }).click();
    await expect(page.locator("#program-summary")).toContainText("Rp250K");
    await page.getByRole("link", { name: "Lanjutkan Pendaftaran" }).click();
    await expect(page.getByLabel("Nama Lengkap")).toHaveValue("Nama Lengkap Persis");
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("persis@example.test");
    await expect(page.getByLabel("Nomor WhatsApp", { exact: true })).toHaveValue("+6281234567890");
    await expect(page.getByLabel("Target Ujian")).toHaveValue("N4");
    await expect(page.getByLabel("Cara Belajar")).toHaveValue("Belajar Mandiri");
    await expect(page.getByLabel("Kata Sandi", { exact: true })).toHaveValue("");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`registration-draft-${width}.png`), fullPage: true });
    await expect(page.getByRole("button", { name: "Buat Akun", exact: true })).toBeEnabled();
  });
}

test("registration draft rejects expired/corrupt data and tolerates blocked storage", async ({ page }) => {
  await mockSelection(page);
  await page.goto("/register?program=n4&plan=sensei");
  for (const raw of ["{broken", JSON.stringify({ name: 7, email: "", whatsapp: "", updatedAt: Date.now() }), JSON.stringify({ name: "Expired", email: "old@example.test", whatsapp: "123", updatedAt: Date.now() - registrationDraftLifetime }), JSON.stringify({ name: "Unsafe", email: "", whatsapp: "", password: "secret", updatedAt: Date.now() })]) {
    await page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), { key: registrationDraftKey, raw });
    await page.reload();
    await expect(page.getByLabel("Nama Lengkap")).toHaveValue("");
    expect(await page.evaluate(key => sessionStorage.getItem(key), registrationDraftKey)).toBeNull();
  }
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("Storage blocked"); };
    Storage.prototype.setItem = () => { throw new Error("Storage blocked"); };
    Storage.prototype.removeItem = () => { throw new Error("Storage blocked"); };
  });
  await page.reload();
  await page.getByLabel("Nama Lengkap").fill("Tanpa Storage");
  await expect(page.getByLabel("Nama Lengkap")).toHaveValue("Tanpa Storage");
  await expect(page.getByRole("button", { name: "Buat Akun", exact: true })).toBeEnabled();
});

test("registration draft survives validation failure but is isolated from other tabs and accounts", async ({ page, context }) => {
  const state = await mockSelection(page);
  state.registerStatus = 422;
  await page.goto("/register?program=n4&plan=sensei");
  await page.getByLabel("Nama Lengkap").fill("Draft Asli");
  await page.getByLabel("Email", { exact: true }).fill("draft@example.test");
  await page.getByLabel("Nomor WhatsApp", { exact: true }).fill("081234567890");
  await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Buat Akun", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Nama Lengkap")).toHaveValue("Draft Asli");
  await page.reload();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("draft@example.test");
  await expect(page.getByLabel("Kata Sandi", { exact: true })).toHaveValue("");
  const other = await context.newPage();
  await other.goto("/register?program=n4&plan=lms");
  await expect(other.getByLabel("Nama Lengkap")).toHaveValue("");
  await other.close();
  state.loggedIn = true;
  await page.goto("/program?program=n4&plan=lms");
  await expect(page.getByRole("link", { name: "Lanjutkan ke Checkout" })).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), registrationDraftKey)).toBeNull();
  state.loggedIn = false;
  await page.goto("/register?program=n4&plan=lms");
  await expect(page.getByLabel("Nama Lengkap")).toHaveValue("");
  await page.getByLabel("Nama Lengkap").fill("Draft Sesi");
  await page.evaluate(() => window.dispatchEvent(new Event("hiru:auth-expired")));
  expect(await page.evaluate(key => sessionStorage.getItem(key), registrationDraftKey)).toBeNull();
});
