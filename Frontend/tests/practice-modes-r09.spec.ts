import { expect, test } from "./canonical-fixture";

for (const width of [390, 1440]) test(`R09 four modes and retry guards ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let unlocked = true;
  let eligible = true;
  let completed = true;
  let valid = true;
  let exists = true;
  let fail = false;
  let access = "full";
  const program = { id: 17, code: "n5", name: "JLPT N5", family: "jlpt" };
  const chapter = () => ({ id: 93, chapter_number: 2, title: "Chapter Uji", access, mini_checkpoint: { exists }, flashcards: [{ id: 7, japanese: "猫", reading: "ねこ", meaning: "Kucing", example: null, sort_order: 1 }], mini_checkpoints: [{ session: 2, part: 3, question_count: 1, duration_minutes: 5, configuration_valid: valid }] });
  const progress = () => ({ chapter_id: 93, activities: Object.fromEntries(["flashcard", "audio", "reading"].map(kind => [kind, { total: 1, completed: 1, complete: true }])), mini_eligible: eligible, mini_unlocked: unlocked, mini_completed: completed });
  const starts: unknown[] = [];
  await page.route("**/api/student/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/dashboard")) {
      if (fail) return route.fulfill({ status: 503, json: {} });
      return reply({ programs: [program], access: { learning: { n5: "full" }, replay_levels: ["n5"], source_grants: [{ plan_code: "sensei", program_code: "n5" }] }, chapters: [{ program_id: 17, chapter: chapter(), progress: progress() }] });
    }
    if (path.endsWith("/chapters")) return reply([chapter()]);
    if (path.endsWith("/chapters/93")) return reply(chapter());
    if (path.endsWith("/progress")) return reply(progress());
    if (path.endsWith("/attempts")) {
      const body = route.request().postDataJSON();
      starts.push(body);
      return reply({ id: 101, kind: body.kind, chapter_id: 93, status: "in_progress", revision: 0, answers: {}, questions: [{ id: 88, question: `Soal ${body.kind}`, options: { A: "Satu", B: "Dua" } }] });
    }
    return route.fallback();
  });
  await page.goto("/practice");
  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(page.getByRole("tab", { name: "Flashcard Review", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: "Buka Flashcard", exact: true }).click();
  await expect(page).toHaveURL(/\/learn\/n5\/chapter-2\/flashcards$/);
  await expect(page.getByRole("button", { name: /Japanese 猫/ })).toBeVisible();
  for (const [name, kind] of [["Audio Drill", "audio"], ["Reading Drill", "reading"]]) {
    await page.goto("/practice");
    await page.getByRole("tab", { name, exact: true }).click();
    await page.reload();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".practice-journey-card")).toHaveCount(1);
    await page.getByRole("button", { name: "Latihan Lagi", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Soal ${kind}`, exact: true })).toBeVisible();
    expect(starts.at(-1)).toEqual({ kind });
  }
  await page.goto("/practice?category=mini");
  await expect(page.getByRole("tab", { name: "Checkpoint Retry", exact: true })).toHaveAttribute("aria-selected", "true");
  const retry = page.getByRole("link", { name: "Ulangi Mini Checkpoint", exact: true });
  await expect(retry).toHaveAttribute("href", "/learn/n5/chapter-2/checkpoint?mini_session=2&mini_part=3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await retry.click();
  await expect(page.getByRole("combobox", { name: "Sesi / Part" })).toHaveValue("2/3");
  await page.getByRole("button", { name: "Mulai", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Soal mini", exact: true })).toBeVisible();
  expect(starts.at(-1)).toEqual({ kind: "mini", session: 2, part: 3 });
  for (const guard of ["unlock", "eligibility", "completed", "configuration", "access", "missing"]) {
    unlocked = guard !== "unlock";
    eligible = guard !== "eligibility";
    completed = guard !== "completed";
    valid = guard !== "configuration";
    exists = guard !== "missing";
    access = guard === "access" ? "locked" : "full";
    await page.goto("/practice?category=mini");
    await expect(page.getByRole("status")).toContainText("Belum ada Mini Checkpoint selesai");
    await expect(retry).toHaveCount(0);
    await expect(page.locator(".practice-journey-card")).toHaveCount(0);
  }
  unlocked = false;
  await page.goto("/learn/n5/chapter-2/checkpoint");
  await expect(page.getByRole("button", { name: "Mulai", exact: true })).toHaveCount(0);
  fail = true;
  await page.goto("/practice?category=mini");
  await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
  await expect(page.locator(".practice-journey-card")).toHaveCount(0);
});
