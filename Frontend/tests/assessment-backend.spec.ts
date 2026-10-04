import { test, expect } from "@playwright/test";

test("placement resumes backend deadline and submits server result without keys or recommendation fallback", async ({ page }) => {
  const question = { id: 10, prompt: "Server question", options: { A: "First", B: "Second", C: "Third", D: "Fourth" } };
  let answers: Record<string, string> = {};
  let completed = false;
  await page.route("**/api/me", route => route.fulfill({ status: 401, json: {} }));
  await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204, headers: { "set-cookie": "XSRF-TOKEN=testing; Path=/" } }));
  await page.route("**/api/placement/attempts/7**", async route => {
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers: { "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, PUT, POST, OPTIONS", "access-control-allow-headers": "content-type, x-xsrf-token" } }); return; }
    if (route.request().method() !== "GET") answers = route.request().postDataJSON().answers;
    if (route.request().url().endsWith("/submit")) completed = true;
    await route.fulfill({ headers: { "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-credentials": "true" }, json: { data: { id: 7, status: completed ? "completed" : "in_progress", questions: [question], answers, expires_at: new Date(Date.now() + 120000).toISOString(), result: completed ? { correct: 0, wrong: 1, unanswered: 0, total: 1, percentage: 0, recommendation_level: null } : null } } });
  });
  await page.goto("/placement/question?attempt=7");
  await expect(page.getByRole("heading", { name: "Server question" })).toBeVisible();
  await expect(page.getByText("Jawaban benar:")).toHaveCount(0);
  await page.getByRole("radio", { name: "A. First" }).check();
  await expect(page.getByRole("status")).toHaveText("Tersimpan");
  await page.reload();
  await expect(page.getByRole("radio", { name: "A. First" })).toBeChecked();
  await page.getByRole("button", { name: "Kumpulkan Jawaban" }).click();
  await expect(page.getByRole("heading", { name: "Hasil Placement Test" })).toBeVisible();
  await expect(page.getByText("LULUS", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lihat Jawaban" })).toHaveCount(0);
  expect(answers).toEqual({ "10": "A" });
});
