import { expect, test } from "./canonical-fixture";

for (const width of [1440, 768, 390]) test(`Account settings and change name ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let user = { id: 901, name: "Sakura", email: "sakura@example.test", whatsapp: "6281234567890", country: "Indonesia", target_jlpt: "N5", role: "student", account_status: "active" };
  await page.route("**/api/me", async route => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      expect(body).toEqual({ name: "Sakura Updated", email: user.email, whatsapp: user.whatsapp, country: user.country, target_jlpt: "N2" });
      user = { ...user, ...body };
    }
    await route.fulfill({ json: { data: user } });
  });
  await page.goto("/profile");
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await expect(page.getByRole("button", { name: /Buka Pengaturan|Tutup Pengaturan/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Akses Cepat" })).not.toContainText("?");
  await expect(page.getByRole("region", { name: "Keanggotaan", exact: true })).not.toContainText("?");
  await page.getByRole("button", { name: "Ubah Nama", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Data Akun", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "Preferensi Belajar", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Nama Lengkap", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Nama Lengkap", { exact: true })).toBeInViewport();
  await page.getByLabel("Nama Lengkap", { exact: true }).fill("Sakura Updated");
  await page.getByRole("combobox", { name: "Target JLPT", exact: true }).selectOption("N2");
  await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profil berhasil diperbarui" })).toBeVisible();
  await page.getByRole("tab", { name: "Keamanan", exact: true }).click();
  await expect(page.getByLabel("Kata Sandi Saat Ini", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ubah Nama", exact: true }).click();
  await expect(page.getByLabel("Nama Lengkap", { exact: true })).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Ubah Nama", exact: true }).click();
  await expect(page.getByLabel("Nama Lengkap", { exact: true })).toHaveValue("Sakura Updated");
  await expect(page.getByRole("combobox", { name: "Target JLPT", exact: true })).toHaveValue("N2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
