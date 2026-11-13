import { expect, test } from "./canonical-fixture";

for (const width of [390, 1440]) test(`Journey practice stays available outside daily practice ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let unlocked = true;
  const program = { id: 17, code: "n5", name: "JLPT N5", family: "jlpt" };
  const chapter = { id: 93, chapter_number: 2, title: "Chapter Uji", access: "full", mini_checkpoint: { exists: true }, flashcards: [{ id: 7, japanese: "猫", reading: "ねこ", meaning: "Kucing", example: null, sort_order: 1 }], mini_checkpoints: [{ session: 2, part: 3, question_count: 1, duration_minutes: 5, configuration_valid: true }] };
  const progress = () => ({ chapter_id: 93, activities: Object.fromEntries(["flashcard", "audio", "reading"].map(kind => [kind, { total: 1, completed: 1, complete: true }])), mini_eligible: true, mini_unlocked: unlocked, mini_completed: true });
  const starts: unknown[] = [];
  await page.route("**/api/student/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/dashboard")) return reply({ programs: [program], access: { learning: { n5: "full" }, replay_levels: ["n5"], source_grants: [{ plan_code: "sensei", program_code: "n5" }] }, chapters: [{ program_id: 17, chapter, progress: progress() }] });
    if (path.endsWith("/chapters")) return reply([chapter]);
    if (path.endsWith("/chapters/93")) return reply(chapter);
    if (path.endsWith("/progress")) return reply(progress());
    if (path.endsWith("/attempts")) {
      const body = route.request().postDataJSON();
      starts.push(body);
      return reply({ id: 101, kind: body.kind, chapter_id: 93, status: "in_progress", revision: 0, answers: {}, questions: [{ id: 88, question: `Soal ${body.kind}`, options: { A: "Satu", B: "Dua" } }] });
    }
    return route.fallback();
  });
  await page.goto("/learn/n5/chapter-2/flashcards");
  await expect(page.getByRole("button", { name: /Japanese 猫/ })).toBeVisible();
  for (const kind of ["audio", "reading"]) {
    await page.goto(`/learn/n5/chapter-2/${kind}?start=1`);
    await expect(page.getByRole("heading", { name: `Soal ${kind}`, exact: true })).toBeVisible();
    expect(starts.at(-1)).toEqual({ kind });
  }
  await page.goto("/learn/n5/chapter-2/checkpoint?mini_session=2&mini_part=3");
  await expect(page.getByRole("region", { name: "Informasi Mini Checkpoint" })).toContainText("1 soal");
  await page.getByRole("button", { name: "Mulai", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Soal mini", exact: true })).toBeVisible();
  expect(starts.at(-1)).toEqual({ kind: "mini", session: 2, part: 3 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  unlocked = false;
  await page.goto("/learn/n5/chapter-2/checkpoint");
  await expect(page.getByRole("button", { name: "Mulai", exact: true })).toHaveCount(0);
});
