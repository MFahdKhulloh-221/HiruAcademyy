import { expect, test } from "./canonical-fixture";

for (const width of [390, 1440]) test(`Audience-only and legacy safety ${width}px (mock API)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const legacy = { id: 1, type: "Pengumuman", title: "Legacy N4", body: "Isi lama", audience: "Mandiri", level: "n4", status: "published", preset: "None", cta_label: null, path: null, time: null };
  const rows = [legacy];
  const writes: Record<string, unknown>[] = [];
  let fail = false;
  await page.route("**/api/admin/notifications**", async route => {
    const method = route.request().method();
    if (method === "GET") { await route.fulfill({ json: { data: rows } }); return; }
    if (fail) { await route.fulfill({ status: 422, json: { message: "Fixture API error" } }); return; }
    const body = route.request().postDataJSON();
    writes.push(body);
    if (method === "POST") rows.push({ ...body, id: rows.length + 1 });
    else Object.assign(rows.find(row => row.id === Number(new URL(route.request().url()).pathname.split("/").at(-1)))!, body);
    await route.fulfill({ status: method === "POST" ? 201 : 200, json: { data: rows.at(-1) } });
  });
  await page.goto("/admin/notifikasi");
  await expect(page.getByRole("cell", { name: "Legacy N4", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Level/ })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Terbatas level N4", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const audience of ["All", "Free", "Mandiri", "Sensei"]) {
    await page.getByRole("button", { name: "Tambah Notifikasi", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Tambah Notifikasi", exact: true });
    await expect(dialog.getByRole("combobox", { name: /Level/ })).toHaveCount(0);
    await expect(dialog.getByRole("combobox", { name: /^Audience/ }).locator("option")).toHaveText(["All", "Free", "Mandiri", "Sensei"]);
    await dialog.getByRole("button", { name: "Simpan Notifikasi" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Judul dan isi notifikasi wajib diisi.");
    await dialog.getByLabel("Judul", { exact: true }).fill(`Baru ${audience}`);
    await dialog.getByRole("textbox", { name: "Isi", exact: true }).fill("Isi baru");
    await expect(dialog.getByLabel("Judul", { exact: true })).toHaveValue(`Baru ${audience}`);
    await expect(dialog.getByRole("textbox", { name: "Isi", exact: true })).toHaveValue("Isi baru");
    await dialog.getByRole("combobox", { name: /^Audience/ }).selectOption(audience);
    await expect(dialog.getByLabel("Judul", { exact: true })).toHaveValue(`Baru ${audience}`);
    await expect(dialog.getByRole("textbox", { name: "Isi", exact: true })).toHaveValue("Isi baru");
    if (audience === "All") {
      fail = true;
      await dialog.getByRole("button", { name: "Simpan Notifikasi" }).click();
      await expect(dialog.getByRole("alert")).toHaveText("Periksa kembali data yang dimasukkan.");
      fail = false;
    }
    await dialog.getByRole("button", { name: "Simpan Notifikasi" }).click();
    await expect(dialog).toBeHidden();
    expect(writes.at(-1)).toMatchObject({ audience, level: null, status: "draft" });
    await expect(page.getByRole("cell", { name: `Baru ${audience}`, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Edit Baru All", exact: true }).click();
  const newEdit = page.getByRole("dialog", { name: "Edit Notifikasi", exact: true });
  await newEdit.getByRole("textbox", { name: "Isi", exact: true }).fill("Isi baru diedit");
  await newEdit.getByRole("button", { name: "Simpan Notifikasi" }).click();
  await expect(newEdit).toBeHidden();
  expect(writes.at(-1)).toMatchObject({ audience: "All", level: null, body: "Isi baru diedit" });
  await page.getByRole("button", { name: "Edit Legacy N4", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Notifikasi", exact: true });
  await expect(edit.getByText("Target legacy masih dibatasi level N4.", { exact: false })).toBeVisible();
  await edit.getByRole("textbox", { name: "Isi", exact: true }).fill("Isi diedit");
  await edit.getByRole("button", { name: "Simpan Notifikasi" }).click();
  await expect(edit).toBeHidden();
  expect(writes.at(-1)).toMatchObject({ level: "n4", body: "Isi diedit" });
  await page.getByRole("button", { name: "Jadikan Draft Legacy N4", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publikasikan Legacy N4", exact: true })).toBeVisible();
  expect(writes.at(-1)).toMatchObject({ level: "n4", status: "draft" });
  await page.getByRole("button", { name: "Publikasikan Legacy N4", exact: true }).click();
  await expect(page.getByRole("button", { name: "Jadikan Draft Legacy N4", exact: true })).toBeVisible();
  expect(writes.at(-1)).toMatchObject({ level: "n4", status: "published" });
  await page.getByRole("button", { name: "Lihat Legacy N4", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Target legacy: Mandiri, terbatas level N4.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit Legacy N4", exact: true }).click();
  page.once("dialog", dialog => dialog.dismiss());
  await edit.getByRole("button", { name: "Hapus batas level legacy" }).click();
  await expect(edit.getByRole("button", { name: "Hapus batas level legacy" })).toBeVisible();
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("seluruh Audience Mandiri"); await dialog.accept(); });
  await edit.getByRole("button", { name: "Hapus batas level legacy" }).click();
  await expect(edit.getByText("Target berdasarkan Audience saja, tanpa batas level.")).toBeVisible();
  await edit.getByRole("button", { name: "Simpan Notifikasi" }).click();
  await expect(edit).toBeHidden();
  expect(writes.at(-1)).toMatchObject({ level: null, status: "published" });
  await page.getByRole("searchbox", { name: "Cari notifikasi" }).fill("tidak ditemukan");
  await expect(page.getByRole("cell", { name: "Legacy N4", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Belum ada data", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
