import { expect, test } from "./canonical-fixture";

test("Sidebar opens destination home and resets active-page state", async ({ page }) => {
  await page.goto("/journey/n5?membership=sensei");
  const nav = page.locator(".student-nav-desktop").getByRole("navigation", { name: "Navigasi siswa" });
  await nav.getByRole("link", { name: "Perjalanan Level", exact: true }).click();
  await expect(page).toHaveURL(/\/journey\?membership=sensei$/);

  await page.evaluate(() => { document.body.dataset.sidebarResetCheck = "stale"; });
  await nav.getByRole("link", { name: "Perjalanan Level", exact: true }).click();
  await page.waitForLoadState("load");
  await expect(page.locator("body")).not.toHaveAttribute("data-sidebar-reset-check", "stale");
  await expect(page).toHaveURL(/\/journey\?membership=sensei$/);

  await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?membership=sensei$/);
});
