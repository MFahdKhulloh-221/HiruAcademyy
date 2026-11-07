import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`OTP recovery ${width}, API mocked`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let verified = false;
    await page.route("**/sanctum/csrf-cookie", async route => {
      await route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } });
    });
    await page.route("**/api/auth/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("reset-grant")) return route.fulfill({ json: { valid: verified } });
      if (path.endsWith("verify-recovery-otp")) {
        verified = route.request().postDataJSON().otp === "123456";
        return route.fulfill({ status: verified ? 200 : 422, json: { message: verified ? "OK" : "Invalid" } });
      }
      return route.fulfill({ json: { message: "OK" } });
    });
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "Verifikasi OTP diperlukan" })).toBeVisible();
    await page.goto("/forgot-password");
    await page.getByLabel("Email", { exact: true }).fill("student@example.com");
    await page.getByRole("button", { name: "Kirim OTP", exact: true }).click();
    await expect(page.getByRole("button", { name: /Kirim ulang dalam/ })).toBeDisabled();
    await page.getByLabel("Kode OTP 6 digit").fill("000000");
    await page.getByRole("button", { name: "Verifikasi OTP" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Kode tidak valid");
    await page.clock.install();
    await page.clock.fastForward(61000);
    await expect(page.getByRole("button", { name: "Kirim Ulang OTP", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Kirim Ulang OTP", exact: true }).click();
    await expect(page.getByRole("button", { name: /Kirim ulang dalam/ })).toBeDisabled();
    await page.getByLabel("Kode OTP 6 digit").fill("123456");
    await page.getByRole("button", { name: "Verifikasi OTP" }).click();
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel("Kata Sandi Baru", { exact: true }).fill("NewPassword123!");
    await page.getByLabel("Konfirmasi Kata Sandi", { exact: true }).fill("NewPassword123!");
    await expect(page.locator("body")).not.toHaveJSProperty("scrollWidth", 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Simpan Kata Sandi" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
}
