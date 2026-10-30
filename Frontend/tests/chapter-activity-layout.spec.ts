import { expect, test } from "./canonical-fixture";

for (const width of [1440, 768, 390]) for (const code of ["n5", "n4", "n3", "n2", "n1", "dasar", "ssw-food", "interview"]) {
  test(`Chapter activity badges ${code} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const program = { id: 1, code, name: code, family: code === "interview" ? "interview" : code === "ssw-food" ? "ssw" : "jlpt" };
    const chapter = { id: 9, program_id: 1, chapter_number: 1, title: "Chapter 1", access: "full", mini_checkpoint: { exists: true }, video_lessons: [{ id: 1, title: "Video" }], modules: [{ id: 2, title: "Modul", module_type: "general" }, { id: 3, title: "Grammar", module_type: "grammar" }], flashcards: [{ id: 4, japanese: "猫", reading: "ねこ", meaning: "Cat" }] };
    let done = false;
    let completed = false;
    await page.route("**/api/student/**", async route => {
      const path = new URL(route.request().url()).pathname;
      const activities = { video: { total: 2, completed: done ? 2 : 1, complete: done }, module: { total: 2, completed: 2, complete: true, completed_ids: [2, 3] }, flashcard: { total: 1, completed: done ? 1 : 0, complete: done }, audio: { total: 1, completed: 1, complete: true }, reading: { total: 0, completed: 0, complete: false } };
      const progress = { chapter_id: 9, activities: done ? { ...activities, reading: { total: 1, completed: 1, complete: true } } : activities, mini_eligible: true, mini_unlocked: done, mini_completed: completed };
      const reply = (data: unknown) => route.fulfill({ json: { data } });
      if (path.endsWith("/dashboard")) return reply({ programs: [program], chapters: [], access: { learning: { [code]: "full" }, replay_levels: [], source_grants: code === "dasar" ? [] : [{ plan_code: "sensei", program_code: code }] } });
      if (path.endsWith("/access")) return reply({ learning: { [code]: "full" }, replay_levels: [], source_grants: code === "dasar" ? [] : [{ plan_code: "sensei", program_code: code }] });
      if (path.endsWith("/programs")) return reply([program]);
      if (path.endsWith("/chapters")) return reply([chapter]);
      if (path.endsWith("/chapters/9")) return reply(chapter);
      if (path.endsWith("/progress")) return reply(progress);
      await route.fallback();
    });
    await page.goto(`/learn/${code}/chapter-1`);
    const grid = page.getByRole("region", { name: "Aktivitas chapter", exact: true });
    await expect(grid.getByRole("heading", { name: "Modul Huruf Jepang & Kanji", exact: true })).toHaveCount(0);
    await expect(grid.getByText("Sedang dikerjakan", { exact: true })).toBeVisible();
    await expect(grid.getByText("Belum dimulai", { exact: true })).toBeVisible();
    await expect(grid.getByRole("heading", { name: "Tata Bahasa", exact: true })).toHaveCount(0);
    await expect(grid.locator("article")).toHaveCount(program.family === "jlpt" ? 6 : 5);
    for (const title of ["Video Lesson", "Modul", "Flashcard", "Audio Question", "Reading Question"]) {
      const card = grid.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
      await expect(card).toBeVisible();
      await expect(card.locator(".learning-activity-top").getByRole("status")).toHaveCount(1);
      await expect(card.locator(":scope > [role=status]")).toHaveCount(0);
      const badge = await card.getByRole("status").boundingBox();
      const box = await card.boundingBox();
      expect(badge!.y - box!.y).toBeLessThan(30);
      expect(box!.x + box!.width - badge!.x - badge!.width).toBeLessThan(30);
      const description = await card.locator(":scope > p").boundingBox();
      const action = await card.locator(".activity-action-button, .learning-activity-unavailable").boundingBox();
      expect(action!.y - description!.y - description!.height).toBeGreaterThanOrEqual(15);
    }
    await expect(grid.getByRole("status").filter({ hasText: /^Selesai$/ })).toHaveCount(2);
    await expect(grid.locator("article").filter({ has: page.getByRole("heading", { name: "Reading Question", exact: true }) }).getByRole("status")).toHaveText("Terkunci");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (program.family !== "jlpt") return;
    const mini = grid.locator("article").filter({ has: page.getByRole("heading", { name: "Mini Checkpoint Chapter 1", exact: true }) });
    await expect(mini.getByRole("status").filter({ hasText: /^Terkunci$/ })).toBeVisible();
    await expect(mini.getByRole("link", { name: "Mulai Mini Checkpoint", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Mini Checkpoint", exact: true })).toHaveCount(0);
    const lockedIcon = await mini.locator(".learning-activity-icon").innerHTML();
    done = true;
    await page.reload();
    await expect(mini.getByRole("status").filter({ hasText: /^Belum dimulai$/ })).toBeVisible();
    await expect(mini.getByRole("link", { name: "Mulai Mini Checkpoint", exact: true })).toHaveAttribute("href", `/learn/${code}/chapter-1/checkpoint`);
    const unlockedIcon = await mini.locator(".learning-activity-icon").innerHTML();
    expect(unlockedIcon).not.toBe(lockedIcon);
    completed = true;
    await page.reload();
    await expect(mini.getByText("Selesai", { exact: true })).toBeVisible();
    const completedIcon = await mini.locator(".learning-activity-icon").innerHTML();
    expect(completedIcon).not.toBe(lockedIcon);
    expect(completedIcon).not.toBe(unlockedIcon);
    await expect(mini.getByRole("status").filter({ hasText: /^Belum dimulai$/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
