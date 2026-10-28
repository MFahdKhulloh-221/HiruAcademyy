import { expect, test } from "./canonical-fixture";

for (const width of [1440, 768, 390]) test(`Replay separate from Journey ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/admin/kurikulum-materi?tab=Program");
  await expect(page.getByRole("navigation", { name: "Journey / Kurikulum & Materi" }).getByRole("link", { name: "Replay Rekaman", exact: true })).toHaveCount(0);
  if (width < 1024) await page.getByRole("button", { name: "Buka navigasi admin", exact: true }).click();
  await page.getByRole("navigation", { name: "Navigasi admin" }).getByRole("link", { name: "Replay Rekaman", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/replay-rekaman$/);
  await expect(page.getByRole("heading", { name: "Replay Rekaman", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Daftar Replay Rekaman", exact: true })).toBeVisible();
  await page.goto("/admin/kurikulum-materi?tab=Replay%20Rekaman");
  await expect(page).toHaveURL(/\/admin\/replay-rekaman$/);
});
