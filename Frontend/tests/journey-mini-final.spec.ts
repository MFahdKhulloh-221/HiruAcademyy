import { expect, test } from "./canonical-fixture";

for (const width of [1440, 768, 390]) {
  test(`Journey Mini states and navigation ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const program = { id: 1, code: "n5", name: "JLPT N5", family: "jlpt" };
    const chapter = { id: 9, program_id: 1, chapter_number: 1, title: "Chapter 1", access: "full", mini_checkpoint: { exists: true }, video_lessons: [{ id: 1, title: "Video" }], modules: [{ id: 2, title: "Modul", module_type: "general" }, { id: 3, title: "Grammar", module_type: "grammar" }], flashcards: [{ id: 4, japanese: "猫", reading: "ねこ", meaning: "Cat" }] };
    let done = false;
    let completed = false;
    await page.route("**/api/student/**", async route => {
      const path = new URL(route.request().url()).pathname;
      const activities = { video: { total: 2, completed: done ? 2 : 1, complete: done }, module: { total: 2, completed: 2, complete: true, completed_ids: [2, 3] }, flashcard: { total: 1, completed: done ? 1 : 0, complete: done }, audio: { total: 1, completed: 1, complete: true }, reading: { total: 0, completed: 0, complete: false } };
      const progress = { chapter_id: 9, activities: done ? { ...activities, reading: { total: 1, completed: 1, complete: true } } : activities, mini_eligible: true, mini_unlocked: done, mini_completed: completed };
      const reply = (data: unknown) => route.fulfill({ json: { data } });
      if (path.endsWith("/access")) return reply({ learning: { n5: "full" }, replay_levels: ["n5"], source_grants: [{ plan_code: "sensei", program_code: "n5" }] });
      if (path.endsWith("/programs")) return reply([program]);
      if (path.endsWith("/chapters")) return reply([chapter]);
      if (path.endsWith("/chapters/9")) return reply(chapter);
      if (path.endsWith("/progress")) return reply(progress);
      await route.fallback();
    });
    await page.goto("/learn/n5/chapter-1");
    const grid = page.getByRole("region", { name: "Aktivitas chapter", exact: true });
    await expect(grid.getByRole("heading", { name: "Modul Huruf Jepang & Kanji", exact: true })).toHaveCount(0);
    await expect(grid.getByText("Sedang dikerjakan", { exact: true })).toBeVisible();
    await expect(grid.getByText("Belum dimulai", { exact: true })).toBeVisible();
    const mini = grid.locator("article").filter({ has: page.getByRole("heading", { name: "Mini Checkpoint Chapter 1", exact: true }) });
    await expect(mini.getByRole("status").filter({ hasText: /^Terkunci$/ })).toBeVisible();
    await expect(mini.getByRole("link", { name: "Mulai Mini Checkpoint", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Mini Checkpoint", exact: true })).toHaveCount(0);
    // Mobile navigation uses its existing menu toggle.
    if (width < 1024) {
      const menu = page.getByRole("button", { name: /Buka menu|Buka navigasi|Menu/i }).first();
      if (await menu.count()) await menu.click();
    }
    await expect(page.getByRole("link", { name: "Checkpoint", exact: true }).first()).toHaveAttribute("href", /\/checkpoint/);
    done = true;
    await page.reload();
    await expect(mini.getByRole("status").filter({ hasText: /^Belum dimulai$/ })).toBeVisible();
    await expect(mini.getByRole("link", { name: "Mulai Mini Checkpoint", exact: true })).toHaveAttribute("href", "/learn/n5/chapter-1/checkpoint");
    completed = true;
    await page.reload();
    await expect(mini.getByText("Selesai", { exact: true })).toBeVisible();
    await expect(mini.getByRole("status").filter({ hasText: /^Belum dimulai$/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ ...chapter, status: "published" }] } }));
    await page.goto("/admin/kurikulum-materi?tab=Mini%20Checkpoint");
    await expect(page.getByRole("button", { name: /Tambah Soal/ }).first()).toBeVisible();
    await page.goto("/admin/checkpoint");
    await expect(page.getByRole("heading", { name: "Checkpoint", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Tambah Checkpoint", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Bank Soal", exact: true }).click();
    await expect(page.getByRole("button", { name: /Tambah Soal/ }).first()).toBeVisible();
    for (const kind of ["Mini Checkpoint"]) {
      await page.goto("/admin/kurikulum-materi?tab=Mini%20Checkpoint");
      await page.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
      await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
      await page.getByRole("button", { name: /Tambah Soal/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("combobox", { name: "Chapter", exact: true })).toHaveValue("9");
      await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill(`Saved ${kind}`);
      for (const letter of ["A", "B", "C", "D"]) await dialog.getByRole("textbox", { name: `Pilihan ${letter}`, exact: true }).fill(`Answer ${letter}`);
      await expect(dialog.getByRole("toolbar", { name: "Format Pertanyaan", exact: true }).getByRole("button", { name: /Furigana/ })).toBeVisible();
      await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("table").getByText(`Saved ${kind}`, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(dialog.getByRole("textbox", { name: "Pertanyaan", exact: true })).toHaveText(`Saved ${kind}`);
      await dialog.getByRole("button", { name: "Batal", exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
