import { expect, test } from "./canonical-fixture";

for (const [path, target] of [["/community/create", "/community"], ["/community/post-1", "/community"], ["/community/ask", "/community?topic=tanya-sensei"]]) {
  test(`legacy community entry redirects ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === target);
    await expect(page.getByRole("button", { name: "Arsip Diskusi Lama", exact: true })).toHaveCount(0);
  });
}
