import { test, expect } from "./canonical-fixture";

const article = (id: number) => ({ id, title: `Artikel ${id}`, slug: `artikel-${id}`, excerpt: "Ringkasan", body: "Isi tersimpan", category: "Tips Belajar", author: "Hiru Academy", thumbnail: null, published: false, published_at: null, featured: false, seo_title: "", meta_description: "" });

test("B1-C internal cancel/discard, Back/Forward recovery, refresh and isolation", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/admin/blog-articles**", async route => {
    if (route.request().method() !== "GET") writes++;
    await route.fulfill({ json: { data: [article(1), article(2)] } });
  });
  await page.goto("/admin/blog-seo");
  await page.getByRole("link", { name: "Artikel 1", exact: true }).click();
  const title = page.getByLabel("Judul artikel", { exact: true });
  await title.fill("Tulisan belum tersimpan");
  await page.getByRole("link", { name: "Kembali ke Artikel", exact: false }).click();
  await expect(page.getByRole("dialog", { name: "Perubahan belum disimpan" })).toBeVisible();
  await page.getByRole("button", { name: "Tetap Mengedit" }).click();
  await expect(title).toHaveValue("Tulisan belum tersimpan");
  await page.getByRole("navigation", { name: "Navigasi admin" }).getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Tetap Mengedit" }).click();
  await expect(title).toHaveValue("Tulisan belum tersimpan");
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("hiru:blog-editor:v1:")).length)).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/blog-seo$/);
  await page.goForward();
  await expect(page.getByRole("region", { name: "Pemulihan tulisan" })).toBeVisible();
  await expect(title).toHaveValue("Artikel 1");
  await page.getByRole("button", { name: "Pulihkan Tulisan" }).click();
  await expect(title).toHaveValue("Tulisan belum tersimpan");
  let unload = 0;
  page.on("dialog", async dialog => { expect(dialog.type()).toBe("beforeunload"); unload++; await dialog.accept(); });
  await page.reload();
  expect(unload).toBe(1);
  await page.getByRole("button", { name: "Pulihkan Tulisan" }).click();
  await expect(title).toHaveValue("Tulisan belum tersimpan");
  await page.goBack();
  await page.getByRole("link", { name: "Artikel 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pulihkan Tulisan" })).toHaveCount(0);
  await expect(title).toHaveValue("Artikel 2");
  await page.goBack();
  await page.getByRole("link", { name: "Artikel 1", exact: true }).click();
  await page.getByRole("button", { name: "Abaikan", exact: true }).click();
  await title.fill("Buang secara eksplisit");
  await page.getByRole("link", { name: "Kembali ke Artikel", exact: false }).click();
  await page.getByRole("button", { name: "Keluar Tanpa Menyimpan" }).click();
  await page.getByRole("link", { name: "Artikel 1", exact: true }).click();
  await expect(title).toHaveValue("Artikel 1");
  await expect(page.getByRole("button", { name: "Pulihkan Tulisan" })).toHaveCount(0);
  expect(writes).toBe(0);
});

test("B1-C stale/expired recovery and close-tab beforeunload", async ({ page }) => {
  await page.route("**/api/admin/blog-articles**", route => route.fulfill({ json: { data: [article(1)] } }));
  await page.goto("/admin/blog-seo/editor?id=1");
  await page.getByLabel("Judul artikel", { exact: true }).fill("Snapshot lama");
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).find(key => key.startsWith("hiru:blog-editor:v1:")))).toBeTruthy();
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(key => key.startsWith("hiru:blog-editor:v1:"))!;
    const data = JSON.parse(sessionStorage.getItem(key)!);
    data.baseline = "server lama";
    sessionStorage.setItem(key, JSON.stringify(data));
  });
  page.on("dialog", dialog => dialog.accept());
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Artikel server sudah berbeda" })).toBeVisible();
  await page.getByRole("button", { name: "Abaikan", exact: true }).click();
  await page.getByLabel("Judul artikel", { exact: true }).fill("Kedaluwarsa");
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("hiru:blog-editor:v1:")).length)).toBe(1);
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(key => key.startsWith("hiru:blog-editor:v1:"))!;
    const data = JSON.parse(sessionStorage.getItem(key)!);
    data.at = 0;
    sessionStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByLabel("Judul artikel", { exact: true })).toHaveValue("Artikel 1");
  await expect(page.getByRole("button", { name: "Pulihkan Tulisan" })).toHaveCount(0);
  await page.getByLabel("Judul artikel", { exact: true }).fill("Tutup tab");
  const dialog = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  expect((await dialog).type()).toBe("beforeunload");
});

test("B1-C pending/failed/successful save guards navigation and clears only saved snapshot", async ({ page }) => {
  let record = article(1);
  let release: (() => void) | undefined;
  let failed = true;
  let writes = 0;
  await page.route("**/api/admin/blog-articles**", async route => {
    if (route.request().method() === "GET") { await route.fulfill({ json: { data: [record] } }); return; }
    writes++;
    await new Promise<void>(resolve => { release = resolve; });
    if (failed) { await route.fulfill({ status: 500, json: { message: "Save failed" } }); return; }
    record = { ...record, ...route.request().postDataJSON() };
    await route.fulfill({ json: { data: record } });
  });
  const snapshots = () => page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("hiru:blog-editor:v1:901:")));
  await page.goto("/admin/blog-seo/editor?id=1");
  await page.evaluate(() => sessionStorage.setItem("hiru:blog-editor:v1:902:1", "other-user-snapshot"));
  await page.getByLabel("Judul artikel", { exact: true }).fill("Masih harus aman");
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  // Dispatch repeated submit attempts while request is held; count actual API mutations.
  await page.getByRole("button", { name: /^Menyimpan/ }).evaluate(button => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
    const form = button.closest("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect(page.getByLabel("Judul artikel", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Ringkasan artikel", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Isi artikel", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Kategori", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Penulis", { exact: true })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Menyimpan");
  expect(writes).toBe(1);

  await page.getByRole("link", { name: "Kembali ke Artikel", exact: false }).click();
  await expect(page.getByRole("button", { name: "Keluar Tanpa Menyimpan" })).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("Tunggu penyimpanan selesai");
  release!();
  await expect(page.getByRole("button", { name: "Keluar Tanpa Menyimpan" })).toBeEnabled();
  await page.getByRole("button", { name: "Tetap Mengedit" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
  await expect(page.getByLabel("Judul artikel", { exact: true })).toHaveValue("Masih harus aman");
  await expect.poll(snapshots).toHaveLength(1);
  await page.getByRole("link", { name: "Kembali ke Artikel", exact: false }).click();
  await page.getByRole("button", { name: "Tetap Mengedit" }).click();
  failed = false;
  release = undefined;
  await page.getByRole("button", { name: "Simpan Draft", exact: true }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  release!();
  await expect(page.getByRole("status")).toContainText("Tersimpan");
  await expect.poll(snapshots).toHaveLength(0);
  await page.getByRole("link", { name: "Kembali ke Artikel", exact: false }).click();
  await expect(page).toHaveURL(/\/admin\/blog-seo$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(snapshots).toHaveLength(0);
  expect(writes).toBe(2);
  expect(await page.evaluate(() => sessionStorage.getItem("hiru:blog-editor:v1:902:1"))).toBe("other-user-snapshot");
});

test("B1-C logout cancel keeps input; explicit exit discards without save", async ({ page }) => {
  let logout = 0;
  await page.route("**/api/auth/logout", async route => { logout++; await route.fulfill({ status: 204 }); });
  await page.route("**/api/admin/blog-articles**", route => route.fulfill({ json: { data: [article(1)] } }));
  await page.goto("/admin/blog-seo/editor?id=1");
  await page.getByLabel("Judul artikel", { exact: true }).fill("Jangan hilang");
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await page.getByRole("button", { name: "Tetap Mengedit" }).click();
  await expect(page.getByLabel("Judul artikel", { exact: true })).toHaveValue("Jangan hilang");
  expect(logout).toBe(0);
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await page.getByRole("button", { name: "Keluar Tanpa Menyimpan" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(logout).toBe(1);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("hiru:blog-editor:v1:")))).toEqual([]);
});

test("B1-C blocked storage reports risk without crashing editor", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("Storage denied", "SecurityError"); } });
  });
  await page.route("**/api/admin/blog-articles**", route => route.fulfill({ json: { data: [article(1)] } }));
  await page.goto("/admin/blog-seo/editor?id=1");
  await page.getByLabel("Judul artikel", { exact: true }).fill("Tetap di editor");
  await expect(page.getByRole("alert").filter({ hasText: "browser" })).toBeVisible();
  await page.getByRole("link", { name: "Kembali ke Artikel", exact: false }).click();
  await page.getByRole("button", { name: "Tetap Mengedit" }).click();
  await expect(page.getByLabel("Judul artikel", { exact: true })).toHaveValue("Tetap di editor");
});
