import { test, expect } from "./canonical-fixture";
import { formatProgramPrice } from "../src/lib/format-program-price";

for (const width of [1440, 768, 390]) {
  test(`Journey filters, dialogs, navigation and landing pricing ${width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    const programs = [5, 4].map(id => ({ id, code: `n${id}`, slug: `n${id}`, name: `JLPT N${id}`, family: "jlpt", status: "active", description: `Informasi N${id}`, sort_order: id }));
    const chapters = [51, 52, 41].map(id => ({ id, program_id: Math.floor(id / 10), chapter_number: id % 10, title: `Chapter ${id}`, sort_order: id, status: "draft" }));
    const writes: { method: string; body: Record<string, unknown> }[] = [];
    await page.route("**/api/admin/**", async route => {
      const resource = new URL(route.request().url()).pathname.split("/")[3];
      if (route.request().method() !== "GET") {
        const body = route.request().postDataJSON();
        writes.push({ method: route.request().method(), body });
        if (resource === "programs" && route.request().method() === "POST") programs.push({ ...programs[0], ...body, id: 6, status: "draft" });
        await route.fulfill({ json: { data: { ...body, id: 6 } } }); return;
      }
      const data = resource === "programs" ? programs : resource === "chapters" ? chapters : resource === "reading-passages" ? chapters.map(item => ({ id: item.id, chapter_id: item.id, title: `Teks ${item.id}`, body: "Bacaan", status: "draft" })) : [51, 52, 41].map(id => ({ id, chapter_id: id, reading_passage_id: id, japanese: `Kartu ${id}`, reading: "bacaan", meaning: "arti", title: `Materi ${id}`, question: `Soal ${id}`, options: { A: "A", B: "B", C: "C", D: "D" }, correct_option: "A", explanation: "Penjelasan", sort_order: id, status: "draft", video_url: "https://example.com/video.mp4", file_url: "https://example.com/modul.pdf", module_type: "grammar" }));
      await route.fulfill({ json: { data } });
    });
    await page.goto("/admin/kurikulum-materi?tab=Program");
    await expect(page.getByRole("columnheader", { name: "Slug", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "+ Tambah Program", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Slug")).toHaveCount(0);
    await dialog.getByLabel("Nama program", { exact: true }).fill("JLPT N2");
    await dialog.getByLabel("Deskripsi / informasi program").fill("Tata bahasa kompleks");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes[0].body.slug).toMatch(/^jlpt-n2-[a-f0-9-]+$/);
    expect(writes[0].body).not.toHaveProperty("status");
    await page.getByRole("row").filter({ hasText: "JLPT N5" }).getByRole("button", { name: "Edit / Atur Urutan" }).click();
    await dialog.getByLabel("Nama program", { exact: true }).fill("JLPT N5 Baru");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes[1].method).toBe("PATCH");
    expect(writes[1].body).not.toHaveProperty("slug");
    const areas = [
      ["/admin/kurikulum-materi?tab=Kurikulum", "+ Tambah Chapter", "Chapter", "Chapter 51"],
      ["/admin/kurikulum-materi?tab=Flashcard", "+ Tambah Kartu", "Flashcard", "Kartu 51"],
      ["/admin/video-lesson", "+ Tambah Video", "Video", "Materi 51"],
      ["/admin/modul", "+ Tambah Modul", "Modul", "Materi 51"],
      ["/admin/reading-question", "+ Tambah Soal", "Reading", "Soal 51"],
      ["/admin/audio-question", "+ Tambah Soal", "Audio", "Soal 51"],
    ];
    for (const [url, add, caption, text] of areas) {
      await page.goto(url);
      const toolbar = page.locator(".admin-journey-toolbar");
      await toolbar.getByLabel("Program", { exact: true }).selectOption("5");
      const table = page.getByRole("table", { name: caption, exact: true });
      await expect(table).toContainText(text);
      await expect(table).not.toContainText(/(?:Chapter|Kartu|Materi|Soal) 41/);
      if (caption !== "Chapter") {
        await toolbar.getByLabel("Chapter", { exact: true }).selectOption("51");
        await expect(table.getByRole("row")).toHaveCount(2);
        await expect(toolbar.getByLabel("Chapter", { exact: true }).getByRole("option", { name: "Chapter 41", exact: true })).toHaveCount(0);
      }
      const button = toolbar.getByRole("button", { name: add, exact: true });
      const bounds = await toolbar.boundingBox();
      const action = await button.boundingBox();
      expect(Math.abs(bounds!.x + bounds!.width - action!.x - action!.width)).toBeLessThan(3);
      if (width === 1440) {
        const filters = await toolbar.locator(".admin-journey-filters").boundingBox();
        expect(filters!.x + filters!.width).toBeLessThanOrEqual(action!.x);
        expect(Math.abs(filters!.y + filters!.height - action!.y - action!.height)).toBeLessThan(3);
      }
      await button.click();
      dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      if (caption === "Reading" || caption === "Audio") await expect(dialog.locator('[contenteditable="true"]').first()).toBeVisible();
      await dialog.getByRole("button", { name: "Tutup dialog" }).click();
      await expect(dialog).toHaveCount(0);
      await table.getByRole("button", { name: caption === "Video" || caption === "Modul" ? "Edit Materi 51" : "Edit", exact: true }).first().click();
      await expect(dialog).toBeVisible();
      const modalBounds = await dialog.boundingBox();
      expect(modalBounds!.x).toBeGreaterThanOrEqual(0);
      expect(modalBounds!.x + modalBounds!.width).toBeLessThanOrEqual(width);
      await dialog.getByRole("button", { name: "Tutup dialog" }).click();
      await expect(dialog).toHaveCount(0);
      if (caption !== "Chapter") {
        await toolbar.getByLabel("Program", { exact: true }).selectOption("4");
        await expect(toolbar.getByLabel("Chapter", { exact: true })).toHaveValue("");
        await expect(table).not.toContainText(text);
        await expect(table).toContainText(caption === "Flashcard" ? "Kartu 41" : caption === "Video" || caption === "Modul" ? "Materi 41" : "Soal 41");
      }
      await toolbar.getByLabel("Program", { exact: true }).selectOption("6");
      await expect(page.getByText(caption === "Reading" || caption === "Audio" ? "Belum ada soal untuk filter ini." : "Belum ada konten untuk filter ini.", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.goto("/admin/kurikulum-materi?tab=Program");
    await page.getByRole("navigation", { name: "Journey / Kurikulum & Materi" }).getByRole("link", { name: "Video Lesson", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/video-lesson$/);
    await page.getByRole("link", { name: "Modul", exact: true }).last().click();
    await expect(page).toHaveURL(/\/admin\/modul$/);
    await page.route("**/api/public/offers", route => route.fulfill({ json: { data: [{ id: 1, program_id: 5, program: programs[0], plan_code: "lms", base_price: 100000, effective_price: 80000, discount_amount: 20000, discount_percent: 20, duration_months: 6, promotion: { starts_at: "2026-10-26", ends_at: "2026-10-28" } }] } }));
    await page.goto("/#pricing");
    await expect(page.locator(".pricing-grid")).toContainText(formatProgramPrice(80000));
    await expect(page.locator(".pricing-grid s")).toHaveText(formatProgramPrice(100000));
    await expect(page.locator(".pricing-grid")).toContainText("Diskon 20%");
    await expect(page.locator(".pricing-grid")).toContainText("/6 bulan");
    await expect(page.locator(".pricing-grid")).not.toContainText("2026-10-26");
    await expect(page.locator(".pricing-grid")).not.toContainText("Periode promo");
    await expect(page.locator(".pricing-grid")).not.toContainText("2026-10-28");
  });
}

for (const width of [1440, 768, 390]) {
  test(`Journey loading and API errors ${width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    for (const [url, resource] of [
      ["/admin/kurikulum-materi?tab=Program", "programs"],
      ["/admin/kurikulum-materi?tab=Kurikulum", "chapters"],
      ["/admin/kurikulum-materi?tab=Flashcard", "flashcards"],
      ["/admin/video-lesson", "video-lessons"],
      ["/admin/modul", "modules"],
      ["/admin/reading-question", "reading-questions"],
      ["/admin/audio-question", "audio-questions"],
    ]) {
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const pattern = `**/api/admin/${resource}`;
      await page.route(pattern, async route => {
        await gate;
        await route.fulfill({ status: 503, json: { message: "Materi sementara gagal dimuat" } });
      });
      await page.goto(url);
      try {
        await expect(page.locator('main [role="status"][aria-busy="true"]')).toBeVisible();
      } finally { release(); }
      await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil. Silakan coba lagi." })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.unroute(pattern);
    }
  });
}
