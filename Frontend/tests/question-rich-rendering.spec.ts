import { expect, test } from "./canonical-fixture";

const rich = '<strong>Bold</strong><em>Italic</em><u>Underline</u><ruby>学校<rt>がっこう</rt></ruby><script>window.__xss = true</script>';
for (const kind of ["audio", "reading", "mini", "tryout"]) {
  test(`${kind} student and review render safe rich text`, async ({ page }) => {
    const program = { id: 1, code: "n5", name: "JLPT N5", family: "jlpt" };
    const chapter = { id: 9, chapter_number: 1, title: "Chapter 1", access: "full", sort_order: 0, mini_checkpoint: { exists: true }, mini_checkpoints: [{ session: 1, part: 1, duration_minutes: 10, passing_score: 70, question_count: 1, configuration_valid: true }] };
    const progress = { chapter_id: 9, activities: {}, mini_unlocked: true, mini_eligible: true };
    let completed = false;
    let answers = {};
    const question = { id: 10, session: "vocabulary_kanji", question: rich, instruction: rich, options: { A: rich, B: "Legacy answer", C: "Third", D: "Fourth" }, passage: { id: 8, title: "Passage", body: rich }, reading_passage: rich };
    const attempt = (review = false) => ({ id: 4, revision: 1, kind, chapter_id: 9, status: completed ? "completed" : "in_progress", answers, questions: [{ ...question, ...(review ? { correct_option: "A", explanation: rich } : {}) }], result: completed ? { correct: 1, wrong: 0, unanswered: 0, percentage: 100, overall_pass: true } : null });
    const detail = { id: 2, title: "Rich Try Out", level: "N5", max_score: 180, duration_minutes: null, sessions: { vocabulary_kanji: "Kosakata & Kanji" } };
    await page.route(/\/api\/student\//, async r => {
      const path = new URL(r.request().url()).pathname;
      const reply = (data: unknown) => r.fulfill({ json: { data } });
      if (path.endsWith("/dashboard")) return reply({ programs: [program], access: { learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "sensei", program_code: "n5" }] }, chapters: [{ program_id: 1, chapter, progress }] });
      if (path.endsWith("/access")) return reply({ learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "sensei", program_code: "n5" }] });
      if (path.endsWith("/try-outs")) return reply([detail]);
      if (path.endsWith("/try-outs/2")) return reply(detail);
      if (path.endsWith("/history")) return reply({ attempts: [], best_score: null });
      if (path.endsWith("/chapters")) return reply([chapter]);
      if (path.endsWith("/chapters/9")) return reply(chapter);
      if (path.endsWith("/progress")) return reply(progress);
      if (path.includes("/attempts")) {
        if (path.endsWith("/answers")) answers = r.request().postDataJSON().answers;
        if (path.endsWith("/submit")) completed = true;
        return reply(attempt(path.endsWith("/review")));
      }
      await r.fallback();
    });
    if (kind === "tryout") {
      await page.goto("/tryout?tryout=2");
      const start = page.getByRole("button", { name: "Mulai Try Out", exact: true });
      await start.click();
    } else {
      if (kind === "mini") {
        await page.goto("/mini-checkpoint");
        await page.getByLabel("Pilih Level:").selectOption("n5");
        await page.getByRole("button", { name: "Mulai Mini Checkpoint", exact: true }).click();
      } else await page.goto(`/learn/n5/chapter-1/${kind}`);
      await page.getByRole("button", { name: "Mulai", exact: true }).click();
    }
    const card = page.locator(".learning-question-card");
    await expect(card.locator("h2 ruby rt")).toHaveText("がっこう");
    await expect(card.locator("h2 strong")).toHaveText("Bold");
    await expect(card.locator("h2 em")).toHaveText("Italic");
    await expect(card.locator("h2 u")).toHaveText("Underline");
    await expect(page.getByRole("radio", { name: "B. Legacy answer" })).toBeVisible();
    expect(await page.evaluate(() => "__xss" in window)).toBe(false);
    await card.locator("label").filter({ has: page.getByRole("radio") }).first().click();
    if (kind === "tryout") {
      page.on("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "Periksa Jawaban", exact: true }).first().click();
      await page.getByRole("button", { name: "Selesaikan Kuis", exact: true }).click();
      await page.getByRole("button", { name: "Review Jawaban", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Kumpulkan Jawaban", exact: true }).click();
      await page.getByRole("button", { name: "Review Jawaban", exact: true }).click();
    }
    await expect(card.locator("ruby rt").last()).toHaveText("がっこう");
    await expect(card.getByText("Jawaban benar:", { exact: false }).locator("ruby rt")).toHaveText("がっこう");
    await expect(card.locator("script")).toHaveCount(0);
    await expect(card).not.toContainText("<strong>");
  });
}

test("Try Out admin preview and review render rich text", async ({ page }) => {
  const question = { id: 10, session: "vocabulary_kanji", question: rich, options: { A: rich, B: "Legacy", C: "Third", D: "Fourth" }, correct_option: "A", explanation: rich, instruction: rich, point_value: 1, sort_order: 0, status: "draft" };
  const item = { id: 2, program_id: 1, title: "Rich admin Try Out", max_score: 180, sort_order: 0, status: "draft", duration_minutes: null, total_passing_score: null, session_passing_scores: null, questions: [question] };
  await page.route("**/api/admin/try-outs**", r => r.fulfill({ json: { data: new URL(r.request().url()).pathname.endsWith("/2") ? item : [item] } }));
  await page.goto("/admin/try-out");
  await page.getByRole("button", { name: "Lihat", exact: true }).click();
  const preview = page.getByRole("region", { name: "Pratinjau Try Out" });
  await preview.getByRole("button", { name: "Runner", exact: true }).click();
  await expect(preview.locator("h2 ruby rt")).toHaveText("がっこう");
  await preview.getByRole("button", { name: "Hasil", exact: true }).click();
  await expect(preview.locator(".tryout-review ruby rt")).toHaveCount(3);
  await expect(preview.locator("script")).toHaveCount(0);
});

test("Placement baseline rich editor remains intact", async ({ page }) => {
  await page.route("**/api/admin/placement-configs", r => r.fulfill({ json: { data: [{ id: 1, title: "Placement", duration_minutes: 7, intro_heading: "Intro", description: "Description", status: "draft" }] } }));
  await page.goto("/admin/placement-hasil");
  await page.getByRole("button", { name: "+ Tambah Soal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "Pertanyaan", exact: true })).toBeVisible();
  await expect(dialog.getByRole("toolbar")).toHaveCount(6);
  for (const option of ["A", "B", "C", "D"]) await expect(dialog.getByRole("textbox", { name: `Pilihan ${option}`, exact: true })).toBeVisible();
});
