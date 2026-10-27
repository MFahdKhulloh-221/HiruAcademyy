import { test, expect } from "@playwright/test";
import { assessmentSessions, assessmentSessionLabels, type ServerAttempt } from "../src/lib/assessment-attempt";

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

for (const pass of [true, false]) {
  test(`Try Out global numbering and ${pass ? "passed" : "failed"} result retry`, async ({ page }) => {
    const questions = assessmentSessions.flatMap((session, section) => Array.from({ length: 25 }, (_, index) => ({ id: 9000 + section * 1000 + index * 7, session, question: `Question ${section * 25 + index + 1}`, options: { A: "First", B: "Second", C: "Third", D: "Fourth" } })));
    const sessions = Object.fromEntries(assessmentSessions.map((session, index) => [session, assessmentSessionLabels[index]]));
    const result = { correct: pass ? 76 : 93, wrong: pass ? 20 : 6, unanswered: pass ? 4 : 1, earned: pass ? 152 : 173, max: 180, total_passing_score: null, overall_pass: pass, sessions: assessmentSessions.map((code, index) => ({ code, label: assessmentSessionLabels[index], earned: 45, max: 45, correct: pass ? 19 : index === 3 ? 18 : 25, wrong: pass ? 5 : index === 3 ? 6 : 0, unanswered: pass ? 1 : index === 3 ? 1 : 0, passing_score: 19, pass: pass || index !== 3 })) };
    let starts = 0;
    let completed = false;
    await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const headers = { "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
      const reply = (data: unknown) => route.fulfill({ headers, json: { data } });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (path === "/sanctum/csrf-cookie") return route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=testing; Path=/" } });
      if (path === "/api/me") return reply({ id: 71, name: "Student", email: "practice@example.test", whatsapp: "081234567890", role: "student", account_status: "active" });
      if (path === "/api/public/programs") return reply([{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }]);
      if (path === "/api/student/access") return reply({ learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] });
      const detail = { id: 2, level: "N5", title: "Server Try Out", max_score: 180, sessions };
      if (path === "/api/student/try-outs") return reply([detail]);
      if (path === "/api/student/try-outs/2") return reply(detail);
      if (path.endsWith("/history")) return reply({ best_score: null, attempts: [] });
      if (path.endsWith("/attempts") && method === "POST") starts++;
      if (path.includes("/attempts")) return reply({ id: starts ? 10 : 9, status: completed && !starts ? "completed" : "in_progress", revision: 0, questions, answers: {}, result: completed && !starts ? result : null });
      return reply([]);
    });
    await page.goto("/tryout?tryout=2&attempt=9");
    const nav = page.getByRole("navigation", { name: "Navigasi soal" });
    for (const [index, label] of assessmentSessionLabels.entries()) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(nav.locator(":scope > div > button")).toHaveText(Array.from({ length: 25 }, (_, position) => String(index * 25 + position + 1)));
      await expect(page.getByRole("heading", { name: `Soal ${index * 25 + 1} dari 100`, exact: true })).toBeVisible();
    }
    completed = true;
    await page.reload();
    await expect(page.locator(".tryout-result-total strong")).toHaveText(String(result.correct));
    await expect(page.locator(".tryout-result-total > span")).toHaveText("/ 100");
    await expect(page.locator(".tryout-result-total p")).toHaveText(pass ? "LULUS" : "BELUM LULUS");
    for (const [index, section] of result.sessions.entries()) {
      const row = page.locator(".tryout-result-sessions article").nth(index);
      await expect(row.locator("strong")).toHaveText(`${section.correct} / 25`);
      await expect(row.locator(".tryout-result-pass")).toHaveText(section.pass ? "LULUS" : "BELUM LULUS");
    }
    await page.getByRole("button", { name: "Ulangi Try Out", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Soal 1 dari 100", exact: true })).toBeVisible();
    expect(starts).toBe(1);
  });
}

for (const kind of ["audio", "reading"] as const) {
  test(`${kind} direct start, autosave recovery, practice result refresh`, async ({ page }) => {
    let starts = 0;
    let submits = 0;
    let failSave = true;
    let server: ServerAttempt = { id: 4, kind, chapter_id: 9, status: "in_progress", revision: 0, questions: [{ id: 10, question: "Practice server question", options: { A: "First", B: "Second" } }], answers: {}, result: null };
    await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const headers = { "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PUT, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
      const reply = (data: unknown, status = 200) => route.fulfill({ status, headers, json: { data } });
      if (method === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
      if (path === "/sanctum/csrf-cookie") { await route.fulfill({ status: 204, headers: { ...headers, "set-cookie": "XSRF-TOKEN=testing; Path=/" } }); return; }
      if (path === "/api/me") { await reply({ id: 71, name: "Practice Student", email: "practice@example.test", whatsapp: "081234567890", role: "student", account_status: "active" }); return; }
      if (path === "/api/public/programs") { await reply([{ id: 5, code: "n5", name: "JLPT N5", family: "jlpt" }]); return; }
      if (path === "/api/student/access") { await reply({ learning: { n5: "full" }, replay_levels: [], source_grants: [{ plan_code: "lms", program_code: "n5" }] }); return; }
      if (path === "/api/student/try-outs") { await reply([{ id: 2, level: "N5", title: "Server Try Out", max_score: 140, sessions: { grammar: "Tata Bahasa", audio: "Audio (Choukai)" } }]); return; }
      if (path === "/api/student/try-outs/2") { await reply({ max_score: 140, sessions: { grammar: "Tata Bahasa", audio: "Audio (Choukai)" } }); return; }
      if (path.endsWith("/history")) { await reply({ best_score: null, attempts: [] }); return; }
      if (path.endsWith("/progress")) { await reply({ chapter_id: 9, activities: {}, mini_unlocked: false }); return; }
      if (path.includes("/chapters/8/attempts")) { await reply(null, 404); return; }
      if (path.includes("/attempts")) {
        if (method === "POST" && path.endsWith("/attempts")) { starts++; expect(route.request().postDataJSON()).toEqual({ kind }); }
        if (method === "PUT") {
          if (failSave) { failSave = false; await reply(null, 503); return; }
          const body = route.request().postDataJSON();
          expect(body.revision).toBe(server.revision);
          server = { ...server, answers: body.answers, revision: server.revision! + 1 };
        }
        if (path.endsWith("/submit")) {
          submits++;
          expect(route.request().postDataJSON().answers).toEqual({ "10": "A" });
          server = { ...server, status: "completed", result: { correct: 1, wrong: 0, unanswered: 0, percentage: 73 } };
        }
        await reply(server); return;
      }
      const chapter = { id: 9, chapter_number: 1, title: "Practice chapter", access: "full", flashcards: [], video_lessons: [], modules: [] };
      if (path.endsWith("/chapters")) { await reply([{ ...chapter, id: 8, chapter_number: 2, title: "Other chapter" }, chapter]); return; }
      if (path.endsWith("/chapters/9")) { await reply(chapter); return; }
      await reply([], 200);
    });
    await page.goto(`/learn/n5/chapter-1/${kind}?start=1`);
    await expect(page.getByRole("heading", { name: "Practice server question" })).toBeVisible();
    expect(starts).toBe(1);
    await expect(page.getByRole("button", { name: "Mulai", exact: true })).toHaveCount(0);
    await page.getByRole("radio", { name: "A. First" }).check();
    await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
    await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Tersimpan");
    await page.getByRole("button", { name: "Kumpulkan Jawaban" }).click();
    await expect(page.getByRole("heading", { name: `Hasil ${kind === "audio" ? "Audio" : "Reading"}` })).toBeVisible();
    await expect(page.getByText("73", { exact: true })).toBeVisible();
    await expect(page.getByText("Jawaban benar:")).toHaveCount(0);
    await page.goto(`/practice?practice_level=n5&practice_chapter=chapter-1&practice_kind=${kind}&attempt=4`);
    await expect(page.getByRole("heading", { name: `Hasil ${kind === "audio" ? "Audio" : "Reading"}` })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: `Hasil ${kind === "audio" ? "Audio" : "Reading"}` })).toBeVisible();
    expect(starts).toBe(1);
    expect(submits).toBe(1);
    await page.goto("/practice?membership=sensei&attempt=4");
    await expect(page.getByRole("heading", { name: `Hasil ${kind === "audio" ? "Audio" : "Reading"}` })).toBeVisible();
    await expect(page).toHaveURL(/\/practice\?membership=sensei&attempt=4$/);
    await page.reload();
    await expect(page.getByRole("heading", { name: `Hasil ${kind === "audio" ? "Audio" : "Reading"}` })).toBeVisible();
    expect(starts).toBe(1);
    await page.getByRole("button", { name: "Kembali ke Daftar Latihan" }).click();
    server = { ...server, status: "in_progress", answers: {}, result: null };
    await page.getByRole("tab", { name: kind === "audio" ? "Audio" : "Reading", exact: true }).click();
    await page.getByRole("article").filter({ has: page.getByRole("heading", { name: `JLPT N5 | Practice chapter | ${kind === "audio" ? "Audio" : "Reading"}`, exact: true }) }).getByRole("button", { name: "Kerjakan Latihan", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Practice server question" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mulai", exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/attempt=4/);
    expect(starts).toBe(2);
    await page.goto("/tryout?tryout=2");
    await expect(page.getByText("INFORMASI SIMULASI", { exact: true })).toBeVisible();
    await expect(page.getByText("140", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Materi Sesi" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Peringatan" })).toBeVisible();
    await expect(page.getByText("125 Menit", { exact: true })).toHaveCount(0);
    await expect(page.getByText("180 Poin", { exact: true })).toHaveCount(0);
  });
}
