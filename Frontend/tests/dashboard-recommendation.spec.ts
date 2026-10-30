import { test, expect } from "./canonical-fixture";

const activity = (completed = 0, complete = false) => ({ total: 2, completed, complete });
const fixture = (code = "dasar") => ({ programs: [{ id: 1, code, name: code.toUpperCase(), family: code === "dasar" ? "basic" : "jlpt" }, { id: 2, code: "n4", name: "N4", family: "jlpt" }], access: { learning: { [code]: "full", n4: "none" }, replay_levels: code === "n5" ? ["n5"] : [], source_grants: [] }, chapters: [{ program_id: 1, chapter: { id: 1, title: "Materi aktif", description: "Materi Journey aktif", chapter_number: 1, access: "full", mini_checkpoint: { exists: code === "n5" } }, progress: { chapter_id: 1, activities: { video: activity(1), module: activity(), flashcard: activity(2, true), audio: activity(2, true), reading: activity(2, true) }, mini_eligible: code === "n5", mini_unlocked: false, mini_completed: false } }, { program_id: 2, chapter: { id: 2, title: "Tidak boleh muncul", chapter_number: 1, access: "full" }, progress: { chapter_id: 2, activities: { video: activity() }, mini_unlocked: false } }] });

test("dashboard recommendations access shuffle routes and responsive UI", async ({ page }) => {
  await page.route("**/api/student/dashboard", route => route.fulfill({ json: { data: fixture() } }));
  await page.goto("/dashboard");
  const panel = page.getByRole("region", { name: "Rekomendasi latihan", exact: true });
  await expect(panel.getByText("Sedang dikerjakan", { exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: /Tonton Video/ })).toHaveAttribute("href", "/learn/dasar/chapter-1/video");
  await panel.getByRole("button", { name: "Rekomendasi Lain" }).click();
  await expect(panel.getByRole("link", { name: /Baca Modul/ })).toHaveAttribute("href", "/learn/dasar/chapter-1/grammar");
  await expect(panel).not.toContainText("Flashcard");
  await expect(panel).not.toContainText("N4");
  await expect(page.getByRole("region", { name: "Menuju Mini Checkpoint" })).toContainText("belum tersedia");
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/dashboard-smart-${width}.png`, fullPage: true });
  }
  await panel.getByRole("link", { name: /Baca Modul/ }).click();
  await expect(page).toHaveURL(/\/learn\/dasar\/chapter-1\/grammar$/);
});

test("dashboard mini prerequisite count unlocked completed empty and API error", async ({ page }) => {
  const data = fixture("n5");
  await page.route("**/api/student/dashboard", route => route.fulfill({ json: { data } }));
  await page.goto("/dashboard");
  const mini = page.getByRole("region", { name: "Menuju Mini Checkpoint" });
  await expect(mini).toContainText("3 dari 5 aktivitas selesai");
  await expect(mini.getByRole("link")).toHaveCount(0);
  const progress = data.chapters[0].progress;
  for (const key of Object.keys(progress.activities) as (keyof typeof progress.activities)[]) progress.activities[key] = activity(2, true);
  progress.mini_unlocked = true;
  await page.reload();
  await expect(mini.getByRole("link", { name: /Kerjakan Mini Checkpoint/ })).toHaveAttribute("href", "/learn/n5/chapter-1/checkpoint");
  await expect(page.getByRole("button", { name: "Rekomendasi Lain" })).toHaveCount(0);
  progress.mini_completed = true;
  await page.reload();
  await expect(mini).toContainText("Mini Checkpoint Selesai");
  await expect(mini.getByRole("link", { name: /Kerjakan Mini Checkpoint/ })).toHaveCount(0);
  data.chapters = [];
  await page.reload();
  await expect(page.getByRole("region", { name: "Rekomendasi latihan", exact: true })).toContainText("Belum ada Journey yang dapat diakses");
  await page.route("**/api/student/dashboard", route => route.fulfill({ status: 500, json: { message: "Fixture error" } }));
  await page.reload();
  await expect(page.getByRole("button", { name: "Coba Lagi", exact: true })).toBeVisible();
});
