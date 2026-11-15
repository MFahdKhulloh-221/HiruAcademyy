import { expect, test } from "@playwright/test";

test("free signup sends referral and lets user correct rejected code", async ({ page }) => {
  const payloads: Record<string, unknown>[] = [];
  let registered = false;
  const user = { id: 71, name: "Siswa Referral", email: "referral@example.test", whatsapp: "6281234567890", role: "student", account_status: "active" };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill(registered ? { json: { data: user } } : { status: 401, json: { message: "Unauthenticated." } });
    if (path === "/api/auth/register") {
      const payload = route.request().postDataJSON();
      payloads.push(payload);
      if (payload.referral_code === "INVALID") return route.fulfill({ status: 422, json: { message: "Kode referral tidak ditemukan atau tidak aktif.", errors: { referral_code: ["Kode referral tidak ditemukan atau tidak aktif."] } } });
      registered = true;
      return route.fulfill({ status: 201, json: { data: user } });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } }));
  await page.goto("/register?referral=INVALID");
  await expect(page.getByLabel("Cara Belajar")).toHaveValue("Free Member");
  const referral = page.getByRole("textbox", { name: "Kode Referral (Opsional)" });
  await expect(referral).toHaveValue("INVALID");
  await page.getByLabel("Nama Lengkap").fill(user.name);
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(user.email);
  await page.getByRole("textbox", { name: "Nomor WhatsApp", exact: true }).fill(user.whatsapp);
  await page.getByLabel("Kata Sandi", { exact: true }).fill("ReferralTest123!");
  await page.getByRole("button", { name: "Buat Akun", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Kode referral tidak valid atau tidak aktif." })).toBeVisible();
  await referral.fill(" HIRU-EC9688-58A863 ");
  await page.getByRole("button", { name: "Buat Akun", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?membership=free$/);
  expect(payloads.map(payload => payload.referral_code)).toEqual(["INVALID", "HIRU-EC9688-58A863"]);
});
