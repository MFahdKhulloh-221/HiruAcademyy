import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) test(`standalone daily practice Free schedule and persistence ${width}`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.clock.install({ time: new Date("2026-11-13T03:00:00Z") });
  await page.context().addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: baseURL! }]);
  let complete = false;
  let started = false;
  let ended = false;
  let revision = 0;
  let answers: Record<string, string> = {};
  let failSave = false;
  let submits = 0;
  let reviews = 0;
  let entitlementReads = 0;
  const categories = ["vocabulary", "grammar", "reading", "audio"];
  const row = (id: number) => ({ id, title: `Latihan ${id}`, category: categories[id - 1], target_level: "n2", question_count: 2, starts_at: "2026-11-13T02:00:00Z", ends_at: ended ? "2026-11-13T02:59:00Z" : "2026-11-13T05:00:00Z", status: id === 1 ? complete ? "completed" : started ? "in_progress" : "open" : "upcoming", can_review: ended });
  const attempt = (review = false) => ({ id: 7, daily_practice_id: 1, revision, status: complete ? "completed" : "in_progress", answers, server_now: "2026-11-13T03:00:00Z", expires_at: row(1).ends_at, questions: [{ id: 81, question: "Pilih jawaban", options: { A: "First", B: "Second", C: "Third", D: "Fourth" }, ...(review ? { correct_option: "A", explanation: "Pembahasan rahasia" } : {}) }, { id: 82, question: "Soal kedua", japanese: { text: "日本", reading: "にほん" }, options: { A: "One", B: "Two" }, ...(review ? { correct_option: "B", explanation: "Pembahasan kedua" } : {}) }], result: complete ? { earned: 1, max: 2, correct: 1, wrong: 0, unanswered: 1 } : null });
  await page.route(/\/(api\/|sanctum\/csrf-cookie)/, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const headers = { "access-control-allow-origin": baseURL!, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PUT, OPTIONS", "access-control-allow-headers": "accept, content-type, x-xsrf-token" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const reply = (data: unknown) => route.fulfill({ headers, json: { data } });
    if (path === "/api/me") return reply({ id: 2, name: "Free Student", email: "free@example.test", whatsapp: "081234567890", role: "student", account_status: "active" });
    if (path.includes("access") || path.includes("dashboard")) { entitlementReads++; return route.fulfill({ headers, status: 503, json: {} }); }
    if (path === "/api/student/daily-practices") return reply(url.searchParams.get("date") === "2026-11-13" ? [1, 2, 3, 4].map(row) : []);
    if (path === "/api/student/daily-practices/1") return reply(row(1));
    if (path.endsWith("/attempt")) { if (request.method() === "POST") started = true; return reply(attempt()); }
    if (path.endsWith("/answers")) {
      if (failSave) return route.fulfill({ status: 503, json: {} });
      expect(request.postDataJSON().revision).toBe(revision);
      answers = request.postDataJSON().answers; revision++; return reply(attempt());
    }
    if (path.endsWith("/submit")) {
      expect(request.postDataJSON()).toEqual({ revision });
      expect(answers).toEqual({ "81": "A" }); complete = true; submits++; return reply(attempt());
    }
    if (path.endsWith("/review")) {
      reviews++; if (!ended) return route.fulfill({ status: 403, json: {} });
      return reply(attempt(true));
    }
    return reply([]);
  });
  await page.goto("/practice");
  await expect(page.getByLabel("Tanggal (WIB)")).toHaveValue("2026-11-13");
  for (const label of ["Kosakata dan Kanji", "Tata Bahasa", "Reading", "Audio"]) await expect(page.getByRole("option", { name: label, exact: true })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Daftar latihan harian" }).getByRole("article")).toHaveCount(4);
  await expect(page.getByText(/Target N2 · 2 soal/)).toHaveCount(4);
  await expect(page.getByText(/Jadwal:.*WIB/)).toHaveCount(4);
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/daily-redesign-student-list-${width}.png`, fullPage: true });
  await page.getByRole("combobox", { name: /^Kategori/ }).selectOption("reading");
  await expect(page.getByRole("region", { name: "Daftar latihan harian" }).getByRole("article")).toHaveCount(1);
  await page.getByRole("combobox", { name: /^Kategori/ }).selectOption("all");
  await page.getByLabel("Tanggal (WIB)").fill("2026-11-12");
  await expect(page.getByRole("heading", { name: "Belum ada latihan pada tanggal ini", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hari Ini", exact: true }).click();
  await page.getByRole("button", { name: "Mulai Latihan Latihan 1", exact: true }).click();
  await expect(page.getByRole("region", { name: "Detail latihan" })).toBeVisible();
  expect(started).toBe(false);
  await expect(page.getByRole("progressbar", { name: "Progres pengerjaan" })).toHaveAttribute("value", "0");
  await expect(page.getByText("Status: Terbuka", { exact: true })).toBeVisible();
  await expect(page.getByText("Pembahasan belum tersedia.", { exact: false })).toBeVisible();
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/daily-redesign-student-detail-${width}.png`, fullPage: true });
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.getByRole("button", { name: "Mulai Latihan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1. Pilih jawaban" })).toBeVisible();
  await expect(page.getByText("Pembahasan rahasia")).toHaveCount(0);
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/daily-redesign-student-runner-${width}.png`, fullPage: true });
  failSave = true;
  await page.getByRole("radio", { name: "A. First" }).check();
  await expect(page.getByRole("alert").filter({ hasText: "Jawaban belum tersimpan" })).toBeVisible();
  await page.getByRole("button", { name: "Selanjutnya" }).click();
  await expect(page.getByRole("heading", { name: "1. Pilih jawaban" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kumpulkan Jawaban" })).toBeDisabled();
  failSave = false;
  await page.getByRole("button", { name: "Coba Simpan Lagi" }).click();
  await expect(page.getByRole("status")).toContainText("Semua jawaban tersimpan");
  await page.getByRole("button", { name: "Kembali ke Daftar Latihan" }).click();
  await page.getByRole("button", { name: "Lanjutkan Latihan 1", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Ringkasan latihan" })).toContainText("1 terjawab · 1 belum dijawab");
  await expect(page.getByRole("progressbar", { name: "Progres pengerjaan" })).toHaveAttribute("value", "1");
  await expect(page.getByText("Status: Dalam pengerjaan", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.getByRole("button", { name: "Lanjutkan Latihan" }).click();
  await expect(page.getByRole("radio", { name: "A. First" })).toBeChecked();
  await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/daily-redesign-student-selected-${width}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByRole("radio", { name: "A. First" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Kumpulkan Jawaban" })).toHaveCount(0);
  await page.getByRole("button", { name: "Selanjutnya" }).click();
  await expect(page.locator("ruby rt")).toHaveText("にほん");
  await page.getByRole("button", { name: "Sebelumnya" }).click();
  await expect(page.getByRole("radio", { name: "A. First" })).toBeChecked();
  await page.getByRole("button", { name: "Soal 2, belum dijawab", exact: true }).click();
  await page.getByRole("button", { name: "Kumpulkan Jawaban" }).click();
  await expect(page.getByRole("dialog")).toContainText("1 soal belum dijawab");
  await expect(page.getByRole("button", { name: "Batal" })).toBeFocused();
  await page.getByRole("button", { name: "Ya, Kumpulkan" }).click();
  await expect(page.getByRole("region", { name: "Hasil latihan" })).toContainText("Skor: 1 / 2");
  await expect(page.getByRole("button", { name: "Lihat Pembahasan" })).toBeDisabled();
  expect(reviews).toBe(0); expect(submits).toBe(1);
  ended = true;
  await page.reload();
  await page.getByRole("button", { name: "Lihat Pembahasan" }).click();
  await expect(page.getByText("Pembahasan rahasia")).toBeVisible();
  expect(reviews).toBe(1); expect(entitlementReads).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
