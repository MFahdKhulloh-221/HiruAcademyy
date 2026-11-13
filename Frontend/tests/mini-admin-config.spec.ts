import { expect, test } from "./canonical-fixture";

for (const width of [1440, 768, 390]) {
  test(`Mini admin configuration reaches student at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    type Row = { id: number; chapter_id: number; question: string; options: Record<string, string>; correct_option: string; status: string; sort_order: number };
    const rows: Row[] = [];
    const writes: Record<string, unknown>[] = [];
    let settings: { mini_checkpoint_duration_minutes: number | null; mini_checkpoint_passing_score: number | null } = { mini_checkpoint_duration_minutes: null, mini_checkpoint_passing_score: null };
    let chapterPatches = 0;
    let rejectSettings = true;
    const program = { id: 1, code: "n5", name: "JLPT N5", family: "jlpt" };
    const access = { learning: { n5: "full" }, replay_levels: ["n5"], source_grants: [{ plan_code: "sensei", program_code: "n5" }] };
    const progress = { chapter_id: 9, activities: {}, mini_unlocked: true, mini_eligible: true };
    const published = () => rows.filter(row => row.status === "published");
    const chapter = () => ({ id: 9, chapter_number: 1, program_id: 1, title: "Chapter 1", status: "published", access: "full", sort_order: 0, ...settings,
      mini_checkpoint: { exists: published().length > 0 }, mini_checkpoints: published().length ? [{ session: 1, part: 1, duration_minutes: settings.mini_checkpoint_duration_minutes, passing_score: settings.mini_checkpoint_passing_score, question_count: published().length, configuration_valid: settings.mini_checkpoint_duration_minutes != null && settings.mini_checkpoint_passing_score != null }] : [] });
    await page.route("**/api/admin/chapters", r => r.fulfill({ json: { data: [chapter()] } }));
    await page.route("**/api/admin/chapters/9", async r => {
      expect(r.request().method()).toBe("PATCH");
      const body = r.request().postDataJSON();
      expect(body).toEqual({ mini_checkpoint_duration_minutes: 7, mini_checkpoint_passing_score: 80 });
      if (rejectSettings) {
        rejectSettings = false;
        return r.fulfill({ status: 422, json: { message: "Invalid configuration", errors: { mini_checkpoint_duration_minutes: ["Pengaturan belum valid."] } } });
      }
      settings = body;
      chapterPatches++;
      await r.fulfill({ json: { data: chapter() } });
    });
    await page.route("**/api/admin/mini-checkpoint-questions**", async r => {
      const req = r.request();
      if (["POST", "PATCH"].includes(req.method())) {
        const body = req.postDataJSON();
        for (const key of ["session", "part", "duration_minutes", "passing_score"]) expect(body).not.toHaveProperty(key);
        writes.push(body);
        if (req.method() === "POST") rows.push({ ...body, id: rows.length + 1 });
        else Object.assign(rows[0], body);
      }
      // Legacy response fields must never leak back into question writes.
      const legacyRows = rows.map(row => ({ ...row, session: 2, part: 3, duration_minutes: 99, passing_score: 1 }));
      await r.fulfill({ json: { data: req.method() === "GET" ? legacyRows : rows[0] } });
    });
    await page.goto("/admin/mini-checkpoint");
    const toolbar = page.locator(".admin-journey-toolbar");
    const settingsButton = toolbar.getByRole("button", { name: "Pengaturan Mini Checkpoint", exact: true });
    await expect(settingsButton).toBeDisabled();
    await toolbar.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
    await toolbar.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
    await expect(page.getByRole("status")).toContainText("Belum diatur");
    await settingsButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("spinbutton", { name: "Durasi (menit)", exact: true })).toHaveValue("");
    await expect(dialog.getByRole("spinbutton", { name: "Nilai minimal lulus (%)", exact: true })).toHaveValue("");
    await expect(dialog).not.toContainText("Satu durasi total berlaku untuk seluruh soal");
    await dialog.getByRole("spinbutton", { name: "Durasi (menit)", exact: true }).fill("7");
    await dialog.getByRole("spinbutton", { name: "Nilai minimal lulus (%)", exact: true }).fill("80");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Periksa kembali data yang dimasukkan.");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("7 menit");
    await expect(page.getByRole("status")).toContainText("80%");
    for (let index = 0; index < 2; index++) {
      await toolbar.getByRole("button", { name: "+ Tambah Soal", exact: true }).click();
      await expect(dialog.getByRole("combobox", { name: "Chapter", exact: true })).toHaveValue("9");
      await expect(dialog.getByRole("spinbutton", { name: /Sesi|Part|Durasi|Nilai minimal lulus/ })).toHaveCount(0);
      await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill(`Saved Mini question ${index + 1}`);
      for (const key of ["A", "B", "C", "D"]) await dialog.getByRole("textbox", { name: `Pilihan ${key}`, exact: true }).fill(`Answer ${key}`);
      await dialog.getByRole("combobox", { name: "Status", exact: true }).selectOption("published");
      await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    await page.reload();
    await toolbar.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
    await toolbar.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
    await settingsButton.click();
    await expect(dialog.getByRole("spinbutton", { name: "Durasi (menit)", exact: true })).toHaveValue("7");
    await expect(dialog.getByRole("spinbutton", { name: "Nilai minimal lulus (%)", exact: true })).toHaveValue("80");
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Edited Mini question");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: /Sesi|Part|Durasi/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Preview", exact: true }).first().click();
    await expect(dialog).toContainText("Edited Mini question");
    await expect(dialog).not.toContainText("Sesi");
    await dialog.getByRole("button", { name: "Tutup dialog", exact: true }).click();
    expect(writes).toHaveLength(3);
    expect(chapterPatches).toBe(1);
    let started = false;
    await page.route(/\/api\/student\//, async r => {
      const path = new URL(r.request().url()).pathname;
      const reply = (data: unknown) => r.fulfill({ json: { data } });
      if (path.endsWith("/dashboard")) return reply({ programs: [program], access, chapters: [{ program_id: 1, chapter: chapter(), progress }] });
      if (path.endsWith("/access")) return reply(access);
      if (path.endsWith("/chapters")) return reply([chapter()]);
      if (path.endsWith("/chapters/9")) return reply(chapter());
      if (path.endsWith("/progress")) return reply(progress);
      if (path.endsWith("/attempts") && r.request().method() === "POST") {
        expect(r.request().postDataJSON()).toMatchObject({ kind: "mini" });
        started = true;
        const startedAt = new Date();
        return reply({ id: 4, revision: 0, kind: "mini", chapter_id: 9, status: "in_progress", answers: {}, result: null,
          duration_minutes: settings.mini_checkpoint_duration_minutes, passing_score: settings.mini_checkpoint_passing_score, server_now: startedAt.toISOString(), started_at: startedAt.toISOString(), expires_at: new Date(startedAt.getTime() + settings.mini_checkpoint_duration_minutes! * 60000).toISOString(),
          questions: published().map(({ id, question, options }) => ({ id, question, options })) });
      }
      await r.fallback();
    });
    await page.goto("/mini-checkpoint");
    await page.getByLabel("Pilih Level:").selectOption("n5");
    await page.getByRole("button", { name: "Mulai Mini Checkpoint", exact: true }).click();
    await expect(page.getByLabel("Sesi / Part")).toHaveCount(0);
    await expect(page.getByText("7 menit untuk seluruh soal", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Mulai", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edited Mini question", exact: true })).toBeVisible();
    expect(started).toBe(true);
    expect(published()).toHaveLength(2);
  });
}
