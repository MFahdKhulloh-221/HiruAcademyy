import { expect, test } from "@playwright/test";
import type { TestimonialContent } from "../src/lib/public-content-api";

test("fixture student, admin CRUD and public channels stay in sync", async ({ page }) => {
  type Item = TestimonialContent & { source: string; moderation_status: string; consent_public: boolean; archived_at: string | null };
  const items: Item[] = [];
  let role = "student";
  let fail = false;
  let mutations = 0;
  let nextId = 100;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const user = { id: 987, name: "Siswa Fixture", email: "fixture@example.test", whatsapp: "081234567890", account_status: "active", avatar: null };
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/me") return route.fulfill({ json: { data: { ...user, role } } });
    if (url.pathname === "/sanctum/csrf-cookie") {
      await page.context().addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: "http://localhost/" }]);
      return route.fulfill({ status: 204 });
    }
    if (url.pathname === "/api/student/testimonial") {
      if (request.method() === "GET") return route.fulfill({ json: { data: items.find(item => item.source === "student" && item.type === (url.searchParams.get("type") || "text")) || null, context: "Program N4" } });
      mutations++;
      const body = request.postDataJSON();
      expect(body).not.toHaveProperty("name");
      expect(body).not.toHaveProperty("user_id");
      const item: Item = { id: nextId++, name: user.name, context: "Program N4", image: null, title: null, video_title: null, video_url: null, video_thumbnail: null, ...body, source: "student", moderation_status: "approved", consent_public: true, published: true, show_on_testimonials: true, landing: false, archived_at: null };
      items.push(item);
      return route.fulfill({ json: { data: item } });
    }
    if (url.pathname === "/api/admin/media") {
      expect(request.method()).toBe("POST");
      expect(request.headers()["content-type"]).toContain("multipart/form-data");
      return route.fulfill({ json: { data: { path: "media/image/11111111-1111-1111-1111-111111111111.png", url: "https://example.test/thumb.png", mime_type: "image/png" } } });
    }
    if (url.pathname.startsWith("/api/admin/testimonials")) {
      if (request.method() === "GET") return route.fulfill({ json: { data: items } });
      mutations++;
      if (fail) return route.fulfill({ status: 422, json: { message: "Fixture save failed" } });
      const id = Number(url.pathname.split("/").pop());
      if (request.method() === "DELETE") {
        items.splice(items.findIndex(item => item.id === id), 1);
        return route.fulfill({ status: 204 });
      }
      const body = request.postDataJSON();
      if (request.method() === "POST") {
        const item = { ...body, id: nextId++, source: "admin", moderation_status: "approved", consent_public: true, archived_at: null };
        items.push(item);
        return route.fulfill({ status: 201, json: { data: item } });
      }
      const item = items.find(item => item.id === id)!;
      if (item.source === "student") {
        expect(body).not.toHaveProperty("name");
        expect(body).not.toHaveProperty("user_id");
      }
      Object.assign(item, body);
      if (item.archived_at) Object.assign(item, { published: false, landing: false, show_on_testimonials: false });
      return route.fulfill({ json: { data: item } });
    }
    if (url.pathname === "/api/testimonials") {
      const eligible = items.filter(item => item.published && item.consent_public && !item.archived_at && (url.searchParams.get("landing") === "true" ? item.landing : item.show_on_testimonials));
      return route.fulfill({ json: { data: url.searchParams.get("landing") === "true" ? eligible.slice(0, 6) : eligible } });
    }
    if (url.pathname === "/api/public/programs") return route.fulfill({ json: { data: [] } });
    if (url.pathname === "/api/student/access") return route.fulfill({ json: { data: { learning: {}, replay_levels: [], source_grants: [] } } });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { data: [] } });
    // Never pass unknown backend calls or third-party resources to network.
    if (url.port === "8000" || !["localhost", "127.0.0.1"].includes(url.hostname)) return route.fulfill({ status: 404 });
    if (!["GET", "HEAD"].includes(request.method())) return route.abort();
    return route.continue();
  });
  const goto = async (path: string) => { await page.goto(path, { waitUntil: "domcontentloaded" }); };
  const publicState = async (visible: boolean, landing: boolean) => {
    await goto("/testimoni");
    await expect(page.locator(".testimonial-card")).toHaveCount(visible ? 1 : 0);
    await goto("/");
    await expect(page.locator(".landing-testimonials .testimonial-card")).toHaveCount(landing ? 1 : 0);
  };
  await goto("/profile/testimoni");
  await page.getByLabel("Komentar / Pengalaman Belajar", { exact: true }).fill("Materi belajar jelas dan latihan sangat membantu siswa.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Kirim Testimoni", exact: true }).click();
  await expect(page.getByText("Tayang", { exact: true })).toBeVisible();
  expect(items[0].landing).toBe(false);
  await publicState(true, false);
  role = "admin";
  await goto("/admin/testimoni");
  const row = () => page.getByRole("article").filter({ has: page.getByRole("heading", { name: user.name, exact: true }) });
  const dialog = () => page.getByRole("dialog");
  await expect(row()).toBeVisible();
  await row().getByRole("button", { name: /^Tindakan / }).click();
  await row().getByRole("button", { name: "Lihat", exact: true }).click();
  await expect(dialog().getByRole("heading", { name: "Detail Testimoni", exact: true })).toBeVisible();
  await expect(dialog().getByText("Pratinjau langsung, belum disimpan.")).toHaveCount(0);
  await expect(dialog().getByRole("blockquote")).toContainText("Materi belajar jelas");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/testimonial-detail-${width}.png` });
  }
  await dialog().getByRole("button", { name: "Tutup dialog" }).click();

  await page.getByLabel("Cari testimoni").fill("tidak-ada");
  await expect(row()).toHaveCount(0);
  await page.getByLabel("Cari testimoni").fill("latihan");
  await expect(row()).toBeVisible();
  await page.getByLabel("Cari testimoni").fill("");
  await row().getByRole("button", { name: /^Tindakan / }).click();
  await row().getByRole("button", { name: "Edit", exact: true }).click();
  await expect(dialog().getByLabel("Nama / atribusi pemilik")).toHaveAttribute("readonly", "");
  await dialog().getByLabel("Komentar / Pengalaman Belajar", { exact: true }).fill("Komentar telah diperbarui Admin dalam fixture.");
  await expect(dialog().getByRole("blockquote")).toHaveText("Komentar telah diperbarui Admin dalam fixture.");
  await dialog().getByLabel("Tampilkan di Landing Page", { exact: false }).check();
  fail = true;
  await dialog().getByRole("button", { name: "Simpan Testimoni" }).click();
  await expect(dialog().getByRole("alert")).toBeVisible();
  await expect(dialog().getByLabel("Komentar / Pengalaman Belajar", { exact: true })).toHaveValue("Komentar telah diperbarui Admin dalam fixture.");
  fail = false;
  await dialog().getByRole("button", { name: "Simpan Testimoni" }).click();
  await expect(dialog()).toHaveCount(0);
  await expect(row()).toContainText("Komentar telah diperbarui");
  await publicState(true, true);
  await goto("/admin/testimoni");
  await row().getByRole("button", { name: /^Tindakan / }).click();
  await row().getByRole("button", { name: "Arsipkan", exact: true }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(row()).toHaveCount(0);
  await page.getByRole("button", { name: "Arsip", exact: true }).click();
  await expect(row()).toBeVisible();
  await publicState(false, false);
  role = "student";
  await goto("/profile/testimoni");
  await expect(page.getByText("Arsip", { exact: true })).toBeVisible();
  role = "admin";
  await goto("/admin/testimoni");
  await page.getByRole("button", { name: "Arsip", exact: true }).click();
  await row().getByRole("button", { name: /^Tindakan / }).click();
  await row().getByRole("button", { name: "Pulihkan", exact: true }).click();
  await expect(dialog().getByLabel("Aktifkan publikasi")).not.toBeChecked();
  await expect(dialog().getByLabel("Tampilkan di Landing Page", { exact: false })).not.toBeChecked();
  await dialog().getByLabel("Aktifkan publikasi").check();
  await dialog().getByLabel("Tampilkan di halaman /testimoni").check();
  await dialog().getByRole("button", { name: "Simpan Testimoni" }).click();
  await expect(dialog()).toHaveCount(0);
  await publicState(true, false);
  await goto("/admin/testimoni");
  await row().getByRole("button", { name: /^Tindakan / }).click();
  await row().getByRole("button", { name: "Edit", exact: true }).click();
  await dialog().getByLabel("Tampilkan di halaman /testimoni").uncheck();
  await dialog().getByRole("button", { name: "Simpan Testimoni" }).click();
  await expect(dialog()).toHaveCount(0);
  await page.getByRole("button", { name: "Arsip", exact: true }).click();
  await expect(row()).toBeVisible();
  await publicState(false, false);
  await goto("/admin/testimoni");
  await page.getByRole("button", { name: "Tambah Testimoni", exact: true }).click();
  await expect(dialog().getByRole("checkbox")).toHaveCount(1);
  await expect(dialog().getByLabel("Aktifkan publikasi")).toHaveCount(0);
  await dialog().getByLabel("Nama / atribusi pemilik").fill("Kurasi Admin Fixture");
  await dialog().getByLabel("Program / konteks").fill("Atribusi terverifikasi");
  await dialog().getByLabel("Komentar / Pengalaman Belajar", { exact: true }).fill("Konten kurasi dengan atribusi yang benar.");
  await expect(dialog().getByRole("blockquote")).toHaveText("Konten kurasi dengan atribusi yang benar.");
  await dialog().getByLabel("Jenis Testimoni", { exact: true }).selectOption("video");
  await dialog().getByLabel("Judul video", { exact: true }).fill("Video Admin Fixture");
  await dialog().getByLabel("URL video", { exact: true }).fill("https://youtu.be/dQw4w9WgXcQ");
  await expect(dialog().getByRole("button", { name: "Tonton Video Admin Fixture" })).toBeVisible();
  await expect(dialog().locator('input[type="file"]')).toHaveCount(1);
  await expect(dialog().getByLabel("URL thumbnail", { exact: true })).toHaveCount(0);
  await dialog().getByLabel("Thumbnail video", { exact: true }).setInputFiles("tests/fixtures/sample.png");
  await expect(dialog().getByRole("button", { name: "Tonton Video Admin Fixture" })).toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog().evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const panel = (await dialog().boundingBox())!;
    const form = (await dialog().locator("form").boundingBox())!;
    const preview = (await dialog().getByRole("region", { name: "Preview Testimoni" }).boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(8);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width - 8);
    expect(preview.width).toBeGreaterThanOrEqual(width === 1440 ? 380 : 280);
    expect(preview.x).toBeGreaterThanOrEqual(panel.x);
    expect(preview.x + preview.width).toBeLessThanOrEqual(panel.x + panel.width);
    if (width === 1440) {
      expect(panel.width).toBeGreaterThan(1050);
      expect(preview.x).toBeGreaterThanOrEqual(form.x + form.width);
    } else {
      expect(preview.y).toBeGreaterThanOrEqual(form.y + form.height);
    }
    await dialog().getByRole("button", { name: "Simpan Testimoni" }).scrollIntoViewIfNeeded();
    await expect(dialog().getByRole("button", { name: "Simpan Testimoni" })).toBeInViewport();
    await dialog().locator(".admin-dialog-content").evaluate(element => { element.scrollTop = 0; });

    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/admin-builder-${width}.png`, fullPage: true });
  }
  await dialog().getByLabel("Tampilkan di halaman /testimoni").check();
  await dialog().getByRole("button", { name: "Simpan Testimoni" }).click();
  await expect(dialog()).toHaveCount(0);
  expect(items.find(item => item.name === "Kurasi Admin Fixture")).toMatchObject({ published: true, show_on_testimonials: true, landing: false });
  await goto("/testimoni");
  await expect(page.getByRole("button", { name: "Tonton Video Admin Fixture" })).toBeVisible();
  await goto("/admin/testimoni");
  const adminRow = page.getByRole("article").filter({ hasText: "Kurasi Admin Fixture" });
  await adminRow.getByRole("button", { name: /^Tindakan / }).click();
  await adminRow.getByRole("button", { name: "Hapus", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await dialog().boundingBox())!.width).toBeLessThanOrEqual(560);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/testimonial-delete-${width}.png` });
  }
  const beforeDelete = mutations;
  await expect(dialog().getByRole("heading", { name: "Hapus Testimoni?" })).toBeVisible();
  await dialog().getByRole("button", { name: "Batal", exact: true }).click();
  expect(mutations).toBe(beforeDelete);
  await expect(adminRow).toBeVisible();
  await adminRow.getByRole("button", { name: /^Tindakan / }).click();
  await adminRow.getByRole("button", { name: "Hapus", exact: true }).click();
  await dialog().getByRole("button", { name: "Hapus Testimoni", exact: true }).click();
  await expect(adminRow).toHaveCount(0);
  items.push({ ...items[0], id: nextId++, name: "Tanpa Consent Fixture", consent_public: false, published: true, landing: true, show_on_testimonials: true });
  items.push({ ...items[0], id: nextId++, name: "Draft Fixture", published: false, landing: false, show_on_testimonials: false });
  items.push({ ...items[0], id: nextId++, name: "Landing Saja Fixture", published: true, landing: true, show_on_testimonials: false });
  await goto("/admin/testimoni");
  await expect(page.getByRole("article").filter({ hasText: "Landing Saja Fixture" })).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "Tanpa Consent Fixture" })).toHaveCount(0);
  await page.getByRole("button", { name: "Arsip", exact: true }).click();
  const noConsent = page.getByRole("article").filter({ hasText: "Tanpa Consent Fixture" });
  await expect(noConsent).toContainText("Menunggu izin publikasi siswa");
  await noConsent.getByRole("button", { name: /^Tindakan / }).click();
  await expect(noConsent.locator("[popover]")).toBeVisible();
  await expect(noConsent.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  await expect(page.getByRole("article")).toHaveCount(3);
  await noConsent.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(dialog().getByLabel("Aktifkan publikasi")).toBeDisabled();
  await dialog().getByRole("button", { name: "Batal", exact: true }).click();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/admin-list-${width}.png`, fullPage: true });
  }
  items.splice(1);
  // Contract boundary: API returns six selected records; frontend renders each once.
  for (let index = 0; index < 7; index++) items.push({ ...items[0], id: nextId++, name: `Landing Fixture ${index}`, published: true, landing: true, show_on_testimonials: true, archived_at: null });
  await goto("/");
  await expect(page.locator(".landing-testimonials .testimonial-card")).toHaveCount(6);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/", "/testimoni"]) {
      await goto(path);
      await expect(page.locator(".testimonial-card").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator(".testimonial-card").first().scrollIntoViewIfNeeded();
      if (path === "/") {
        await expect(page.locator(".landing-testimonials")).toHaveAttribute("data-revealed", "true");
        await page.locator(".landing-testimonials").evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
      }
      await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/public-${path === "/" ? "landing" : "testimonials"}-${width}.png` });
    }
  }
  expect(errors).toEqual([]);
});
