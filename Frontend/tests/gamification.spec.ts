import { test, expect, gamificationFixture } from "./canonical-fixture";
import type { OverallProgressData } from "../src/lib/learning-api";

const emptyProgress: OverallProgressData = {
  overall_percentage: 0, streak_days: 0, kanji_mastered: 0, practice_completed: 0, accuracy: 0,
  active_program: { name: "JLPT N5", level: "N5", percentage: 0 }, programs: [], chapters: [],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/student/progress", route => route.fulfill({ json: { data: emptyProgress } }));
});

for (const [status, label, activeDays] of [["active", "Aktif", 3], ["achieved", "Selesai", 5], ["expired", "Berakhir", 2]] as const) {
  test(`dashboard/progress share XP; challenge ${status} uses API period and days`, async ({ page }) => {
    const data = { ...gamificationFixture, weekly_xp: 1234, streak_days: 3, challenge: { ...gamificationFixture.challenge, status, active_days: activeDays, badge: status === "achieved" ? "Pemula Konsisten" : null } };
    await page.route("**/api/student/gamification", route => route.fulfill({ json: { data } }));
    await page.goto("/dashboard");
    await expect(page.locator(".gamification-metrics")).toContainText("1.234 XP");
    await expect(page.locator(".gamification-metrics")).toContainText("3Hari Streak");
    await page.getByRole("button", { name: "Progres", exact: true }).click();
    await page.getByRole("link", { name: "Ringkasan Progres", exact: true }).click();
    await expect(page).toHaveURL(/\/progress/);
    const challenge = page.locator(".gamification-challenge");
    await expect(challenge).toContainText("1.234 XP");
    await expect(challenge.getByText("2026-10-08 – 2026-10-14", { exact: true })).toBeVisible();
    await expect(challenge.getByText(`${activeDays}/5 Hari · 7 Hari`, { exact: true })).toBeVisible();
    await expect(challenge.getByRole("progressbar", { name: "Tantangan 7 Hari Pertama" })).toHaveAttribute("value", String(activeDays));
    await expect(challenge.getByRole("progressbar")).toHaveAttribute("max", "5");
    await expect(challenge.getByText(label, { exact: true })).toBeVisible();
    await expect(challenge.getByText("Pemula Konsisten", { exact: true })).toHaveCount(status === "achieved" ? 1 : 0);
    await page.reload();
    await expect(challenge).toContainText("1.234 XP");
    await expect(challenge.getByText(label, { exact: true })).toBeVisible();
  });
}

for (const path of ["/dashboard", "/progress"]) {
  test(`${path} gamification loading, error retry and empty activity`, async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let fail = true;
    await page.route("**/api/student/gamification", async route => {
      await pending;
      await route.fulfill(fail ? { status: 503, json: { message: "XP sementara tidak tersedia" } } : { json: { data: gamificationFixture } });
    });
    await page.goto(path);
    await expect(page.getByRole("status").filter({ hasText: path === "/dashboard" ? "Memuat progres…" : "Memuat XP Mingguan…" })).toBeVisible();
    await expect(page.locator(".gamification-metrics")).toHaveCount(0);
    release();
    const error = page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil. Silakan coba lagi." });
    await expect(error).toBeVisible();
    await expect(page.locator(".gamification-metrics")).toHaveCount(0);
    fail = false;
    await error.getByRole("button", { name: "Coba Lagi" }).click();
    await expect(page.locator(".gamification-metrics")).toContainText("0 XP");
    await expect(error).toHaveCount(0);
    if (path === "/progress") {
      await expect(page.locator(".gamification-challenge")).toContainText("0/5 Hari · 7 Hari");
      await expect(page.getByRole("progressbar", { name: "Tantangan 7 Hari Pertama" })).toHaveAttribute("value", "0");
      await expect(page.locator(".gamification-challenge .progress-streak-badge")).toHaveCount(0);
    }
  });
}

test("same browser logout/login never carries previous account XP or challenge", async ({ page, context }) => {
  const nextStudent = { id: 902, name: "Second Student", email: "second@example.test", whatsapp: "6281999000902", role: "student", account_status: "active" };
  let secondAccount = false;
  let loggedOut = false;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await context.addCookies([{ name: "XSRF-TOKEN", value: "test-token", url: "http://localhost:3000" }]);
  await page.route("**/api/auth/logout", async route => {
    loggedOut = true;
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/me", route => loggedOut ? route.fulfill({ status: 401, json: {} }) : secondAccount ? route.fulfill({ json: { data: nextStudent } }) : route.fallback());
  await page.route("**/api/auth/login", async route => {
    secondAccount = true;
    loggedOut = false;
    await route.fulfill({ json: { data: nextStudent } });
  });
  await page.route("**/api/student/gamification", async route => {
    if (secondAccount) await pending;
    await route.fulfill({ json: { data: secondAccount ? gamificationFixture : { ...gamificationFixture, weekly_xp: 321, challenge: { ...gamificationFixture.challenge, status: "achieved", active_days: 5, badge: "First Account Badge" } } } });
  });
  await page.goto("/progress");
  await expect(page.locator(".gamification-challenge")).toContainText("321 XP");
  await expect(page.getByText("First Account Badge", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email / WhatsApp").fill(nextStudent.email);
  await page.getByLabel("Kata Sandi", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Halo, Second Student/ })).toBeVisible();
  await expect(page.locator(".gamification-metrics")).toHaveCount(0);
  await expect(page.getByText("321 XP", { exact: true })).toHaveCount(0);
  release();
  await expect(page.locator(".gamification-metrics")).toContainText("0 XP");
  await page.getByRole("button", { name: "Progres", exact: true }).click();
  await page.getByRole("link", { name: "Ringkasan Progres", exact: true }).click();
  await expect(page.locator(".gamification-challenge")).toContainText("0 XP");
  await expect(page.locator(".gamification-challenge")).toContainText("0/5 Hari · 7 Hari");
  await expect(page.getByText("First Account Badge", { exact: true })).toHaveCount(0);
  await expect(page.getByText("321 XP", { exact: true })).toHaveCount(0);
});
