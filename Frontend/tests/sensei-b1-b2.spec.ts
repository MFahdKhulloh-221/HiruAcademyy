import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`Sensei bio edit and order ${width}, API persistence mocked`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let profiles = [1, 2, 3].map(id => ({ id, name: `Sensei ${id}`, role: "Pengajar", bio: id === 1 ? "" : "Bio lama", expertise: ["Kaiwa"], photo: "", level: null, active: true, sort_order: id }));
    let fail = false;
    await page.context().addCookies([{ name: "XSRF-TOKEN", value: "test", url: "http://localhost:3000" }]);
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/me") return route.fulfill({ json: { data: { id: 99, name: "Admin", role: "admin", email: "admin@example.test", whatsapp: "6281234567890", account_status: "active" } } });
      if (path.startsWith("/api/admin/sensei-profiles/") && route.request().method() === "PATCH") {
        if (fail) return route.fulfill({ status: 500, json: {} });
        const id = Number(path.split("/").pop());
        const input = route.request().postDataJSON();
        const profile = { ...profiles.find(item => item.id === id)!, ...input };
        profiles = profiles.filter(item => item.id !== id);
        profiles.splice(input.sort_order - 1, 0, profile);
        profiles = profiles.map((item, index) => ({ ...item, sort_order: index + 1 }));
        return route.fulfill({ json: { data: profile } });
      }
      return route.fulfill({ json: { data: path.includes("sensei-profiles") ? profiles : [] } });
    });
    await page.goto("/admin/sensei");
    await page.getByRole("button", { name: "Tindakan Sensei 3", exact: true }).click();
    await page.getByRole("button", { name: "Edit Sensei 3", exact: true }).click();
    const editor = page.getByRole("dialog");
    const bio = "Pengajar bahasa Jepang berpengalaman. ".repeat(20);
    await editor.getByRole("textbox", { name: "Bio singkat", exact: true }).fill(bio);
    await editor.getByLabel("Urutan Tampil").fill("1");
    await expect(editor).toContainText("Mengubah urutan akan menyesuaikan posisi Sensei lainnya secara otomatis.");
    await editor.getByRole("button", { name: "Simpan Sensei", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("row").nth(1)).toContainText("Sensei 3");
    await page.reload();
    await expect(page.getByRole("row").nth(1)).toContainText("Sensei 3");
    fail = true;
    await page.getByRole("button", { name: "Tindakan Sensei 3", exact: true }).click();
    await page.getByRole("button", { name: "Edit Sensei 3", exact: true }).click();
    await editor.getByRole("button", { name: "Simpan Sensei", exact: true }).click();
    await expect(editor.getByRole("alert")).toBeVisible();
    await page.goto("/sensei");
    const cards = page.locator(".sensei-grid .sensei-card");
    await expect(cards.first()).toContainText("Sensei 3");
    await expect(cards.nth(1).locator(".line-clamp-3")).toHaveCount(0);
    await expect(cards.first().locator(".line-clamp-3")).toHaveText(bio.trim());
    expect(await cards.first().locator(".line-clamp-3").evaluate(element => getComputedStyle(element).webkitLineClamp)).toBe("3");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
