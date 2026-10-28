import { expect, test } from "./canonical-fixture";

for (const code of ["ssw-food", "interview"]) for (const width of [1440, 768, 390]) {
  test(`${code} admin chapter, journey and completion ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const slug = code === "ssw-food" ? "ssw-pengolahan-makanan" : code;
    const name = code === "ssw-food" ? "SSW Pengolahan Makanan" : "Persiapan Interview";
    const program = { id: 7, code, name, family: code === "ssw-food" ? "ssw" : "interview", status: "inactive" };
    const rows: Record<string, unknown>[] = [];
    let completed = false;
    let empty = false;
    let locked = false;
    let fail = false;
    const access = () => ({ learning: { [code]: locked ? "none" : "full" }, replay_levels: [], source_grants: locked ? [] : [{ plan_code: "lms", program_code: code }] });
    const chapter = () => ({ ...rows[0], id: 9, chapter_number: 1, title: "Owned program chapter", access: locked ? "locked" : "full", sort_order: 0 });
    const progress = () => ({ chapter_id: 9, activities: { module: { total: 1, completed: completed ? 1 : 0, complete: completed, completed_ids: completed ? [51] : [] } }, mini_unlocked: false });
    await page.route("**/api/admin/programs", r => r.fulfill({ json: { data: [program] } }));
    await page.route("**/api/admin/chapters**", async r => {
      if (r.request().method() === "POST") rows.push({ ...r.request().postDataJSON(), id: 9 });
      await r.fulfill({ json: { data: r.request().method() === "GET" ? rows : rows[0] } });
    });
    await page.goto("/admin/kurikulum-materi");
    await page.getByRole("button", { name: "Tambah Chapter", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Judul", exact: true }).fill("Owned program chapter");
    await dialog.getByRole("combobox", { name: "Status", exact: true }).selectOption("published");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(rows[0]).toMatchObject({ program_id: 7, title: "Owned program chapter", status: "published" });
    await page.route(/\/api\/student\//, async r => {
      const path = new URL(r.request().url()).pathname;
      const reply = (data: unknown) => r.fulfill({ json: { data } });
      if (path.endsWith("/dashboard")) return reply({ programs: [program], access: access(), chapters: empty ? [] : [{ program_id: 7, chapter: chapter(), ...(locked ? {} : { progress: progress() }) }] });
      if (path.endsWith("/chapters")) {
        if (fail) return r.fulfill({ status: 503, json: {} });
        return reply(empty ? [] : [chapter()]);
      }
      if (path.endsWith("/progress")) return reply(progress());
      if (path.endsWith("/completions")) {
        expect(r.request().postDataJSON()).toEqual({ type: "module", resource_id: 51 });
        completed = true;
        return reply(progress());
      }
      if (path.endsWith("/chapters/9")) return reply({ ...chapter(), video_lessons: [], modules: [{ id: 51, title: "Program module", module_type: code === "interview" ? "kanji" : "general", file_url: null, sort_order: 0 }], flashcards: [], mini_checkpoint: { exists: true } });
      await r.fallback();
    });
    await page.goto(`/journey/${slug}`);
    await expect(page.getByRole("heading", { name: "Owned program chapter", exact: true })).toBeVisible();
    await expect(page.getByText("Checkpoint: belum tersedia; kontrak attempt siswa belum disetujui.", { exact: true })).toBeVisible();
    await page.locator(`a[href="/learn/${slug}/chapter-1"]`).first().click();
    const activities = page.getByRole("region", { name: "Aktivitas chapter", exact: true });
    await expect(activities.getByRole("heading", { name: "Modul", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Mini Checkpoint/ })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(code === "ssw-food" ? "SSW Pengolahan Makanan" : "Interview");
    await activities.locator("article").filter({ has: page.getByRole("heading", { name: "Modul", exact: true }) }).getByRole("link", { name: "Buka", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Program module", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tandai Selesai", exact: true }).click();
    await expect(page.getByRole("button", { name: "Selesai", exact: true })).toBeDisabled();
    await page.goto(`/journey/${slug}`);
    await expect(page.getByRole("progressbar", { name: "Progress Owned program chapter", exact: true })).toHaveAttribute("value", "100");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    locked = true;
    await page.reload();
    await expect(page.locator(`a[href="/learn/${slug}/chapter-1"]`)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Upgrade ke/ })).not.toContainText("JLPT");
    empty = true;
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Belum ada chapter");
    fail = true;
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Belum ada chapter");
  });
}
