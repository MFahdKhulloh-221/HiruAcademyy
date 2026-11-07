import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`OTP recovery ${width}, API mocked`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    let verified = false;
    let sends = 0;
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
      if (path.endsWith("forgot-password")) {
        sends++;
        return route.fulfill({ json: { status: sends <= 5 ? "accepted" : "daily_limit_reached", accepted: sends <= 5, daily_limit_reached: sends >= 5, retry_after: sends <= 5 ? 30 : 0 } });
      }
      if (path.endsWith("reset-password")) verified = false;
      return route.fulfill({ json: { message: "OK" } });
    });
    await page.goto("/reset-password");
    await expect(page.getByLabel("Kata Sandi Baru", { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/forgot-password\?verification=required$/);
    await expect(page.getByText("Verifikasi OTP melalui email terlebih dahulu.", { exact: true })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("student@example.com");
    await page.getByRole("button", { name: "Kirim OTP", exact: true }).dblclick();
    await expect(page.getByRole("button", { name: /Kirim ulang dalam/ })).toBeDisabled();
    expect(sends).toBe(1);
    await page.clock.fastForward(29000);
    await expect(page.getByRole("button", { name: /Kirim ulang dalam/ })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("button", { name: /Kirim ulang dalam/ })).toBeDisabled();
    await page.clock.fastForward(1000);
    await expect(page.getByRole("button", { name: "Kirim Ulang OTP", exact: true })).toBeEnabled();
    expect(sends).toBe(1);
    await page.getByLabel("Email", { exact: true }).fill("student@example.com");
    await page.getByLabel("Kode OTP 6 digit").fill("000000");
    await page.getByRole("button", { name: "Verifikasi OTP" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Kode tidak valid");
    await page.getByRole("button", { name: "Kirim Ulang OTP", exact: true }).click();
    await expect(page.getByRole("button", { name: /Kirim ulang dalam/ })).toBeDisabled();
    expect(sends).toBe(2);
    await page.clock.fastForward(600000);
    await expect(page.getByRole("button", { name: "Kirim Ulang OTP", exact: true })).toBeEnabled();
    expect(sends).toBe(2);
    for (let count = 3; count <= 5; count++) {
      await page.getByRole("button", { name: "Kirim Ulang OTP", exact: true }).click();
      await expect(page.getByRole("button", { name: /Kirim ulang dalam/ })).toBeDisabled();
      expect(sends).toBe(count);
      if (count === 5) {
        await expect(page.getByRole("dialog", { name: "Batas OTP Harian Tercapai" })).toBeVisible();
        await page.getByRole("button", { name: "Mengerti" }).click();
      }
      await page.clock.fastForward(30000);
    }
    await page.getByRole("button", { name: "Kirim Ulang OTP", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Batas pengiriman OTP hari ini sudah tercapai. Silakan coba lagi besok.");
    expect(sends).toBe(6);
    await page.getByRole("button", { name: "Mengerti" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByLabel("Kode OTP 6 digit").fill("123456");
    await page.getByRole("button", { name: "Verifikasi OTP" }).click();
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.reload();
    await page.getByLabel("Kata Sandi Baru", { exact: true }).fill("NewPassword123!");
    await page.getByLabel("Konfirmasi Kata Sandi", { exact: true }).fill("NewPassword123!");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Simpan Kata Sandi" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/forgot-password\?verification=required$/);
    expect(sends).toBe(6);
  });
}

test("no password form while grant check pending or revoked, API mocked", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/auth/reset-grant", async route => {
    await gate;
    await route.fulfill({ json: { valid: false } });
  });
  await page.goto("/reset-password");
  await expect(page.getByLabel("Kata Sandi Baru", { exact: true })).toHaveCount(0);
  release();
  await expect(page).toHaveURL(/\/forgot-password\?verification=required$/);
});

for (const branch of ["daily_limit_reached", "cooldown", "ip_limited", "http429", "network"] as const) {
  test(`server decision ${branch}, fresh browser with no local count, API mocked`, async ({ page }) => {
    let requests = 0;
    await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=test; Path=/; SameSite=Lax" } }));
    await page.route("**/api/auth/forgot-password", route => {
      requests++;
      if (branch === "network") return route.abort();
      if (branch === "http429") return route.fulfill({ status: 429, json: { message: "Rate limited" } });
      return route.fulfill({ json: { status: branch, accepted: false, daily_limit_reached: branch === "daily_limit_reached", retry_after: branch === "cooldown" ? 17 : 60 } });
    });
    await page.goto("/forgot-password");
    await page.getByLabel("Email", { exact: true }).fill("student@example.com");
    await page.getByRole("button", { name: "Kirim OTP", exact: true }).click();
    if (branch === "daily_limit_reached") {
      await expect(page.getByRole("dialog", { name: "Batas OTP Harian Tercapai" })).toBeVisible();
      await page.getByRole("button", { name: "Mengerti" }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
    } else {
      await expect(page.locator("form.auth-form").getByRole("alert")).toBeVisible();
      await expect(page.getByRole("dialog")).not.toBeVisible();
    }
    expect(requests).toBe(1);
    await expect(page.getByLabel("Kode OTP 6 digit")).toHaveCount(0);
  });
}
