import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const frontend = "http://localhost:3026";
const backend = "http://localhost:8026";
const marker = "QA FIXTURE ONLY — NOT PRODUCT BANK";
const categories = ["Bunpou", "Moji・Goi", "Dokkai", "Choukai"];
type Question = { id: number; prompt: string; category: string; level: string; passage?: string; reading_passage?: string; audio_url?: string };
type Attempt = { id: number; adaptive: boolean; question_limit: number; revision: number; expires_at: string; questions: Question[]; answers: Record<string, string>; result: null | { recommendation_level: string; correct: number; wrong: number; total: number } };

async function api<T>(page: Page, path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await page.evaluate(async ({ url, method, body }) => {
    const token = document.cookie.split("; ").find(item => item.startsWith("XSRF-TOKEN="))?.slice(11);
    const response = await fetch(url, { method, credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { "X-XSRF-TOKEN": decodeURIComponent(token) } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, text: await response.text() };
  }, { url: backend + path, method, body });
  expect(response.status, `${method} ${path}: ${response.text}`).toBeGreaterThanOrEqual(200);
  expect(response.status, `${method} ${path}: ${response.text}`).toBeLessThan(300);
  return JSON.parse(response.text).data as T;
}

function assertPublic(attempt: Attempt) {
  expect(attempt.adaptive).toBe(true);
  const serialized = JSON.stringify(attempt);
  for (const secret of ["correct_option", "grading_snapshot", "content_snapshot", "explanation", "owner_hash"]) expect(serialized).not.toContain(`"${secret}"`);
  for (const question of attempt.questions) expect(question.prompt).toContain(marker);
}

test("real isolated adaptive placement: admin bank, 12/20/25, N1/N5, refresh and idempotent submit", async ({ browser, baseURL }) => {
  test.skip(process.env.HIRU_PLACEMENT_REAL_QA !== "1", "Requires dedicated isolated QA server; never run against default services.");
  test.setTimeout(1200000);
  expect(baseURL).toBe(frontend);
  const identity = JSON.parse(readFileSync(process.env.HIRU_PLACEMENT_QA_IDENTITY!, "utf8"));
  expect(identity).toMatchObject({ environment: "testing", database: "hiru_academy_test", api: backend, frontend });
  expect(identity.schema).toMatch(/^hiru_browser_test_placement_[a-z0-9_]+$/);

  const adminContext = await browser.newContext({ baseURL: frontend });
  adminContext.setDefaultTimeout(30000);
  const admin = await adminContext.newPage();
  try {
    await admin.goto("/login");
    await admin.getByLabel("Email / WhatsApp").fill("placement.qa@example.test");
    await admin.getByLabel("Kata Sandi", { exact: true }).fill("PlacementQaOnly123!");
    await admin.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(admin).toHaveURL(/\/admin$/);
    await admin.goto("/admin/placement-hasil");
    await admin.getByLabel("Judul Tes", { exact: true }).fill(marker);
    await admin.getByLabel("Intro Heading", { exact: true }).fill(`${marker} placement`);
    await admin.getByLabel("Durasi Pengerjaan (menit)").fill("30");
    await admin.getByLabel("Deskripsi Tes", { exact: true }).fill("Isolated local adaptive integration fixture. Not learning material.");
    await admin.getByRole("combobox", { name: /Jumlah Soal/ }).selectOption("25");
    const created = admin.waitForResponse(response => response.url().endsWith("/api/admin/placement-configs") && response.request().method() === "POST");
    await admin.getByRole("button", { name: "Simpan Draft", exact: true }).click();
    const configResponse = await created;
    expect(configResponse.status(), await configResponse.text()).toBe(201);
    const configId = (await configResponse.json()).data.id as number;
    const keys = new Map<number, string>();
    let order = 0;
    // Full coverage: 5 levels × 4 categories × ceil(25 / 4) = 140.
    // Keys come only from authenticated Admin writes, never public endpoints.
    for (const level of ["N5", "N4", "N3", "N2", "N1"]) {
      for (const category of categories) {
        for (let number = 1; number <= 7; number++) {
          order++;
          const correct = ["A", "B", "C", "D"][order % 4];
          const question = await api<{ id: number; correct_option: string }>(admin, "/api/admin/placement-questions", "POST", {
            placement_config_id: configId, prompt: `${marker} ${level} ${category} ${number}`,
            options: { A: "QA option A", B: "QA option B", C: "QA option C", D: "QA option D" },
            correct_option: correct, category, level, status: "published", sort_order: order,
            passage: category === "Dokkai" ? `${marker}\nこれはテスト用の文章です。` : null,
            audio_url: category === "Choukai" ? `${backend}/qa-placement-fixture.wav` : null,
            explanation: `${marker} private admin key`,
          });
          expect(question.correct_option).toBe(correct);
          keys.set(question.id, correct);
        }
      }
    }
    expect(keys.size).toBe(140);
    await admin.reload();
    const publish = admin.waitForResponse(response => response.url().endsWith(`/api/admin/placement-configs/${configId}`) && response.request().method() === "PATCH");
    await admin.getByRole("button", { name: "Terbitkan", exact: true }).click();
    const published = await publish;
    expect(published.status(), await published.text()).toBe(200);
    await expect(admin.getByRole("status").filter({ hasText: "Placement test diterbitkan." })).toBeVisible();

    const previewStart = admin.waitForResponse(response => response.url().endsWith(`/api/admin/placement-configs/${configId}/preview`) && response.request().method() === "POST");
    await admin.getByRole("button", { name: "Pratinjau Tes", exact: true }).click();
    const previewResponse = await previewStart;
    expect(previewResponse.status(), await previewResponse.text()).toBe(201);
    const previewAttempt: Attempt = (await previewResponse.json()).data;
    assertPublic(previewAttempt);
    const previewDialog = admin.getByRole("dialog");
    await expect(previewDialog.getByRole("heading", { name: previewAttempt.questions[0].prompt, exact: true })).toBeVisible();
    const previewSave = admin.waitForResponse(response => response.url().endsWith(`/api/admin/placement-previews/${previewAttempt.id}/answers`) && response.request().method() === "PUT");
    await previewDialog.getByRole("radio").nth(["A", "B", "C", "D"].indexOf(keys.get(previewAttempt.questions[0].id)!)).check();
    const previewSaved = await previewSave;
    expect(previewSaved.status()).toBe(200);
    let previewCurrent: Attempt = (await previewSaved.json()).data;
    expect(previewCurrent.questions).toHaveLength(2);
    for (let index = 1; index < previewCurrent.question_limit; index++) {
      const question = previewCurrent.questions.at(-1)!;
      await expect(previewDialog.getByRole("heading", { name: question.prompt, exact: true })).toBeVisible();
      const save = admin.waitForResponse(response => response.url().endsWith(`/api/admin/placement-previews/${previewCurrent.id}/answers`) && response.request().method() === "PUT");
      await previewDialog.getByRole("radio").nth(["A", "B", "C", "D"].indexOf(keys.get(question.id)!)).check();
      const saved = await save;
      expect(saved.status()).toBe(200);
      previewCurrent = (await saved.json()).data;
      assertPublic(previewCurrent);
    }
    const previewSubmit = admin.waitForResponse(response => response.url().endsWith(`/api/admin/placement-previews/${previewCurrent.id}/submit`) && response.request().method() === "POST");
    await previewDialog.getByRole("button", { name: "Selesaikan Test", exact: true }).click();
    const previewCompleted = await previewSubmit;
    expect(previewCompleted.status()).toBe(200);
    expect((await previewCompleted.json()).data.result.recommendation_level).toBe("N1");
    await previewDialog.getByRole("button", { name: "Tutup dialog", exact: true }).click();
    await expect(previewDialog).toHaveCount(0);

    for (const limit of [12, 20, 25]) {
      await api(admin, `/api/admin/placement-configs/${configId}`, "PATCH", { question_count: limit });
      for (const correctRun of [true, false]) {
        const guestContext = await browser.newContext({ baseURL: frontend, locale: "id-ID", timezoneId: "Asia/Jakarta" });
        const guest = await guestContext.newPage();
        try {
          await guest.goto("/placement");
          await guest.getByPlaceholder("Masukkan nama").fill(correctRun ? "QA Peserta Benar" : "QA Peserta Salah");
          await guest.getByPlaceholder("+62 8xx xxxx xxxx").fill("+62 81999000027");
          await guest.locator("select[name='target']").selectOption("N2");
          await guest.locator(".consent input[type='checkbox']").first().check();
          const start = guest.waitForResponse(response => response.url().endsWith("/api/placement/attempts") && response.request().method() === "POST");
          await guest.getByRole("button", { name: "Mulai Placement Test Gratis" }).click();
          const started = await start;
          expect(started.status()).toBe(201);
          let attempt: Attempt = (await started.json()).data;
          assertPublic(attempt);
          expect(attempt.question_limit).toBe(limit);
          expect(attempt.questions).toHaveLength(1);
          expect(attempt.questions[0].level).toBe("N3");
          const expires = attempt.expires_at;
          const seen = new Set<number>();
          for (let index = 0; index < limit; index++) {
            const question = attempt.questions.at(-1)!;
            expect(seen.has(question.id)).toBe(false);
            seen.add(question.id);
            await expect(guest.getByRole("heading", { name: question.prompt, exact: true })).toBeVisible();
            await expect(guest.getByText(`Soal ${index + 1}/${limit}`, { exact: true })).toBeVisible();
            await expect(guest.getByRole("button", { name: /Sebelumnya/ })).toHaveCount(0);
            expect(question.category).toBe(categories[index % 4]);
            if (question.category === "Dokkai") await expect(guest.getByText((question.reading_passage ?? question.passage)!, { exact: true })).toBeVisible();
            if (question.category === "Choukai") {
              await expect(guest.getByLabel("Audio", { exact: true })).toHaveAttribute("src", `${backend}/qa-placement-fixture.wav`);
              expect(await guest.getByLabel("Audio", { exact: true }).evaluate(async (element: HTMLMediaElement) => { element.muted = true; await element.play(); return !element.paused; })).toBe(true);
            }
            const key = keys.get(question.id)!;
            expect(key).toBeTruthy();
            const answer = correctRun ? key : key === "A" ? "B" : "A";
            const save = guest.waitForResponse(response => response.url().endsWith(`/api/placement/attempts/${attempt.id}/answers`) && response.request().method() === "PUT");
            await guest.getByRole("radio").nth(["A", "B", "C", "D"].indexOf(answer)).check();
            const saved = await save;
            expect(saved.status(), await saved.text()).toBe(200);
            const next: Attempt = (await saved.json()).data;
            assertPublic(next);
            expect(next.revision).toBe(attempt.revision + 1);
            expect(next.questions).toHaveLength(Math.min(index + 2, limit));
            expect(next.answers[question.id]).toBe(answer);
            expect(next.expires_at).toBe(expires);
            attempt = next;
            if (index === 2) {
              await guest.reload();
              const persisted = await api<Attempt>(guest, `/api/placement/attempts/${attempt.id}`);
              expect(persisted).toMatchObject({ id: attempt.id, revision: attempt.revision, questions: attempt.questions, answers: attempt.answers, expires_at: attempt.expires_at, result: attempt.result });
              await expect(guest.getByRole("heading", { name: attempt.questions.at(-1)!.prompt, exact: true })).toBeVisible();
            }
          }
          const submit = guest.waitForResponse(response => response.url().endsWith(`/api/placement/attempts/${attempt.id}/submit`) && response.request().method() === "POST");
          await guest.getByRole("button", { name: "Selesaikan Test", exact: true }).click();
          const submitted = await submit;
          expect(submitted.status()).toBe(200);
          const completed: Attempt = (await submitted.json()).data;
          assertPublic(completed);
          expect(completed.result).toMatchObject({ recommendation_level: correctRun ? "N1" : "N5", total: limit, correct: correctRun ? limit : 0, wrong: correctRun ? 0 : limit });
          await expect(guest).toHaveURL(new RegExp(`/placement/result\\?attempt=${attempt.id}`));
          await expect(guest.locator(".placement-score-grid article")).toHaveCount(4);
          await expect(guest.getByRole("status").filter({ hasText: "Program sesuai estimasi belum tersedia." })).toBeVisible();
          await expect(guest.locator(".placement-recommendation-grid article")).toHaveCount(1);
          await expect(guest.getByRole("link", { name: /^Lihat Program/ })).toHaveCount(0);
          const repeated = await api<Attempt>(guest, `/api/placement/attempts/${attempt.id}/submit`, "POST", { answers: attempt.answers, revision: attempt.revision });
          expect(repeated).toMatchObject({ id: completed.id, revision: completed.revision, questions: completed.questions, answers: completed.answers, expires_at: completed.expires_at, result: completed.result });
          await guest.reload();
          await expect(guest.getByRole("heading", { name: `Pilihan Belajar untuk Level ${correctRun ? "N1" : "N5"}` })).toBeVisible();
        } finally {
          await guestContext.close();
        }
      }
    }
  } finally {
    await adminContext.close();
  }
});
