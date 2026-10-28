import { expect, test } from "./canonical-fixture";

for (const width of [1440, 768, 390]) {
  test(`Mini admin configuration reaches student at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    type Row = { id: number; chapter_id: number; question: string; options: Record<string, string>; correct_option: string; status: string; session: number; part: number; duration_minutes: number | null; passing_score: number | null };
    const rows: Row[] = [];
    const program = { id: 1, code: "n5", name: "JLPT N5", family: "jlpt" };
    const access = { learning: { n5: "full" }, replay_levels: ["n5"], source_grants: [{ plan_code: "sensei", program_code: "n5" }] };
    const progress = { chapter_id: 9, activities: {}, mini_unlocked: true, mini_eligible: true };
    const published = () => rows.filter(row => row.status === "published");
    const chapter = () => ({ id: 9, chapter_number: 1, program_id: 1, title: "Chapter 1", status: "published", access: "full", sort_order: 0, mini_checkpoint: { exists: published().length > 0 }, mini_checkpoints: published().length ? [{ session: 2, part: 3, duration_minutes: published()[0].duration_minutes, passing_score: published()[0].passing_score, question_count: published().length, configuration_valid: true }] : [] });
    await page.route("**/api/admin/chapters", r => r.fulfill({ json: { data: [chapter()] } }));
    await page.route("**/api/admin/mini-checkpoint-questions**", async r => {
      const req = r.request();
      if (["POST", "PATCH"].includes(req.method())) {
        const body = req.postDataJSON();
        if (body.status === "published" && (body.duration_minutes == null || body.passing_score == null)) {
          await r.fulfill({ status: 422, json: { message: "Invalid configuration", errors: { passing_score: ["Published Mini requires duration and passing score."] } } }); return;
        }
        if (req.method() === "POST") rows.push({ ...body, id: rows.length + 1 });
        else Object.assign(rows[0], body);
      }
      await r.fulfill({ json: { data: req.method() === "GET" ? rows : rows[0] } });
    });
    await page.goto("/admin/mini-checkpoint");
    await expect(page.locator(".admin-journey-toolbar")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Journey / Kurikulum & Materi" }).getByRole("link", { name: "Mini Checkpoint", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
    await dialog.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("9");
    await dialog.getByRole("spinbutton", { name: "Sesi", exact: true }).fill("2");
    await dialog.getByRole("spinbutton", { name: "Part", exact: true }).fill("3");
    await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Saved Mini question");
    for (const key of ["A", "B", "C", "D"]) await dialog.getByRole("textbox", { name: `Pilihan ${key}`, exact: true }).fill(`Answer ${key}`);
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(rows[0]).toMatchObject({ status: "draft", passing_score: null, duration_minutes: null });
    expect(published()).toHaveLength(0);
    await page.reload();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Status", exact: true }).selectOption("published");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Published Mini requires");
    expect(rows[0].status).toBe("draft");
    await dialog.getByRole("spinbutton", { name: "Durasi (menit)", exact: true }).fill("7");
    await dialog.getByRole("spinbutton", { name: "Passing score (%)", exact: true }).fill("80");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(dialog.getByRole("spinbutton", { name: "Passing score (%)", exact: true })).toHaveValue("80");
    await expect(dialog.getByRole("spinbutton", { name: "Durasi (menit)", exact: true })).toHaveValue("7");
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(dialog).toContainText("Passing score 80%");
    await expect(dialog).toContainText("1 soal Published");
    await dialog.getByRole("button", { name: "Tutup dialog", exact: true }).click();
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
        expect(r.request().postDataJSON()).toMatchObject({ kind: "mini", session: 2, part: 3 });
        started = true;
        const configuration = published()[0];
        const startedAt = new Date();
        return reply({ id: 4, revision: 0, kind: "mini", chapter_id: 9, status: "in_progress", answers: {}, result: null,
          duration_minutes: configuration.duration_minutes, passing_score: configuration.passing_score, server_now: startedAt.toISOString(), started_at: startedAt.toISOString(), expires_at: new Date(startedAt.getTime() + configuration.duration_minutes! * 60000).toISOString(),
          questions: published().map(({ id, question, options }) => ({ id, question, options })) });
      }
      await r.fallback();
    });
    await page.goto("/mini-checkpoint");
    await page.getByLabel("Pilih Level:").selectOption("n5");
    await page.getByRole("button", { name: "Mulai Mini Checkpoint", exact: true }).click();
    await expect(page.getByLabel("Sesi / Part")).toHaveValue("2/3");
    await page.getByRole("button", { name: "Mulai", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Saved Mini question", exact: true })).toBeVisible();
    expect(started).toBe(true);
    expect(published()).toHaveLength(1);
  });
}
