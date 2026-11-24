import { expect, test, type Page } from "./canonical-fixture";

// Explicit API mocks only: no backend, database, or assertion that stub bytes form XLSX.
const tryOut = { id: 7, title: "Try Out Reports", level: "N5" };
const otherTryOut = { id: 8, title: "Try Out Kedua", level: "N4" };
const options = { A: "Pilihan pertama", B: "Pilihan kedua", C: "Pilihan ketiga", D: "Pilihan keempat" };
const questions = Array.from({ length: 10 }, (_, index) => {
  const number = index + 1;
  const blank = number === 10;
  const correct = number === 2 || blank ? 0 : 2;
  const wrong = number === 2 ? 2 : 0;
  return { version: `7:${number}`, id: 700 + number, fingerprint: `snapshot-${number}-${"a".repeat(48)}`, section: number === 9 ? "reading" : "grammar", number, question: `Pertanyaan snapshot ${number}`, options, correct_option: "A", received: 3, not_received: 1, correct, wrong, unanswered: blank ? 3 : 1, correct_percentage: correct ? 66.67 : 0, distribution: { A: { count: correct, percentage: correct ? 66.67 : 0 }, B: { count: wrong, percentage: wrong ? 66.67 : 0 }, C: { count: 0, percentage: 0 }, D: { count: 0, percentage: 0 } } };
});
const revisedQuestion = { ...questions[0], version: "7:1:revision", fingerprint: `snapshot-1-${"b".repeat(48)}`, question: "Pertanyaan snapshot 1 revisi", received: 1, correct: 0, wrong: 1, unanswered: 0, correct_percentage: 0, distribution: { A: { count: 0, percentage: 0 }, B: { count: 1, percentage: 100 }, C: { count: 0, percentage: 0 }, D: { count: 0, percentage: 0 } } };
const reportQuestions = [...questions, revisedQuestion];
const hardest = [questions[1], questions[9], ...questions.slice(2, 8)];
const participant = (id: number) => ({ id, user_id: 91, name: "Rina Mock", whatsapp: "628123456789", started_at: "2026-10-01T01:00:00Z", completed_at: "2026-10-01T02:00:00Z", status: "completed", raw_score: id === 101 ? 30 : 70, final_score: id === 101 ? 30 : 70, max_score: 100, overall_pass: id !== 101, sessions: [{ code: "grammar", label: "Tata Bahasa", earned: id === 101 ? 0 : 2, max: 2, correct: id === 101 ? 0 : 1, wrong: id === 101 ? 1 : 0, unanswered: 0, pass: id !== 101 }] });
const attempts = [101, 102].map(id => participant(id));
const summary = { responses: 4, unique_participants: 1, mean: 78.928, median: 50, min: 30, max: 70, passed: 2, failed: 2 };

async function mockReports(page: Page) {
  const state = { empty: false, hardest, questions: reportQuestions, failures: new Set<string>(), requests: [] as URL[] };
  await page.route("**/api/admin/try-outs**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    state.requests.push(url);
    expect(route.request().method()).toBe("GET");
    if (state.failures.has(path)) return route.fulfill({ status: 500, json: { message: "Mock report unavailable" } });
    if (path.endsWith("/export.xlsx")) return route.fulfill({ contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: "explicit mocked export response" });
    if (/\/attempts\/\d+$/.test(path)) {
      const id = Number(path.split("/").at(-1));
      return route.fulfill({ json: { data: { try_out: tryOut, participant: participant(id), attempts, questions: [{ ...questions[1], session: "grammar", answer: id === 101 ? "B" : "A", explanation: "Pembahasan snapshot tersimpan", point_value: 2, earned: id === 101 ? 0 : 2, outcome: id === 101 ? "wrong" : "correct" }, { ...questions[9], session: "grammar", answer: "", explanation: "Pembahasan soal kosong", point_value: 2, earned: 0, outcome: "unanswered" }] } } });
    }
    if (path.endsWith("/participants")) {
      const current = Number(url.searchParams.get("page") ?? 1);
      return route.fulfill({ json: { data: state.empty ? [] : [participant(current === 1 ? 101 : 102)], meta: { current_page: current, last_page: state.empty ? 1 : 2, total: state.empty ? 0 : 21, per_page: 20 } } });
    }
    if (path.endsWith("/reports")) return route.fulfill({ json: { data: { try_out: tryOut, summary: { ...summary, responses: state.empty ? 0 : 4 }, histogram: state.empty ? [] : [{ label: "0–49", count: 2 }, { label: "50–100", count: 2 }], questions: state.empty ? [] : state.questions, hardest: state.empty ? [] : state.hardest } } });
    if (path === "/api/admin/try-outs") return route.fulfill({ json: { data: [tryOut, otherTryOut].map(item => ({ ...item, program_id: 1, status: "published", sort_order: 1, max_score: 100, total_passing_score: 60, questions: [] })) } });
    if (/^\/api\/admin\/try-outs\/[78]$/.test(path)) return route.fulfill({ json: { data: { ...(path.endsWith("/8") ? otherTryOut : tryOut), program_id: 1, status: "published", questions: [] } } });
    throw new Error(`Unexpected mocked try-out endpoint: ${path}`);
  });
  return state;
}

async function openResults(page: Page) {
  await page.goto("/admin/try-out");
  await page.getByRole("row").filter({ hasText: tryOut.title }).getByRole("button", { name: "Hasil & Analitik", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hasil Try Out", exact: true })).toBeVisible();
}
const detail = (page: Page) => page.getByRole("article", { name: "Detail analisis soal", exact: true });
const list = (page: Page) => page.getByRole("complementary", { name: "Daftar analisis soal", exact: true });
const resultButton = (page: Page) => page.getByRole("button", { name: /^Lihat hasil Rina Mock,/ });
const formButton = (page: Page, letter: string) => page.getByRole("group", { name: "Pilih data soal", exact: true }).getByRole("button", { name: new RegExp(`^Bentuk ${letter}\\b`) });
const answer = (page: Page) => page.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^Soal 2 ·/ }) });
async function noOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

for (const width of [1440, 768, 390]) {
  test(`mocked results: four tabs and open details fit actual admin route at ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && /hydration|server rendered/i.test(message.text())) errors.push(message.text()); });
    await page.setViewportSize({ width, height: 1000 });
    await mockReports(page);
    await openResults(page);
    await expect(page.getByRole("heading", { name: "Pengerjaan selesai", exact: true })).toBeVisible();
    await expect(page.getByText(/Peserta unik/i)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/fingerprint|penyebut/i);
    const guide = page.locator("details").filter({ hasText: "Cara membaca laporan" });
    await expect(guide).not.toHaveAttribute("open", "");
    for (const tab of ["Ringkasan", "Daftar Nilai", "Analisis Soal", "Hasil Siswa"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel", { name: tab, exact: true })).toBeVisible();
      if (tab === "Daftar Nilai") await expect(resultButton(page)).toBeVisible();
      if (tab === "Hasil Siswa") await expect(page.getByRole("button", { name: "Buka Daftar Nilai", exact: true })).toBeVisible();
      if (tab === "Analisis Soal") {
        await expect(formButton(page, "A")).toHaveAttribute("aria-pressed", "true");
        await expect(detail(page).getByText(questions[0].question, { exact: true })).toBeVisible();
        if (width === 390) await expect(detail(page).getByText("66,7%", { exact: true })).toHaveCSS("white-space", "nowrap");
        await expect(page.getByRole("combobox", { name: "Bentuk soal", exact: true })).toHaveCount(0);
        await detail(page).locator("summary").filter({ hasText: "Mengapa ada beberapa bentuk?" }).click();
        await detail(page).locator("summary").filter({ hasText: "Detail teknis" }).click();
        await expect(detail(page).getByText(questions[0].fingerprint, { exact: false })).toBeVisible();
      }
      await noOverflow(page);
      if ((width === 390 || width === 1440) && (tab === "Ringkasan" || tab === "Analisis Soal")) {
        await page.screenshot({ path: testInfo.outputPath(`${tab === "Ringkasan" ? "summary" : "analysis"}-${width}.png`), fullPage: true, animations: "disabled" });
      }
    }
    await page.getByRole("button", { name: "Buka Daftar Nilai", exact: true }).click();
    await resultButton(page).click();
    await expect(answer(page)).not.toHaveAttribute("open", "");
    await answer(page).locator("summary").click();
    await expect(page.getByText("Jawaban siswa: B · Kunci: A", { exact: true })).toBeVisible();
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("daily practice retains separate version picker and existing analysis", async ({ page }) => {
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/admin/daily-practices**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/participants")) return route.fulfill({ json: { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 20 } } });
    if (path.endsWith("/reports")) return route.fulfill({ json: { data: { summary, histogram: [], questions: reportQuestions, hardest: [] } } });
    return route.fulfill({ json: { data: [{ id: 7, title: "Latihan analitik", category: "grammar", target_level: "n5", status: "published", starts_at: "2026-11-13T08:00:00+07:00", ends_at: "2026-11-13T10:00:00+07:00", question_count: 10, attempts_count: 4 }] } });
  });
  await page.goto("/admin/latihan-harian");
  await page.getByRole("tab", { name: "Terbit", exact: true }).click();
  await page.getByRole("button", { name: "Analisis", exact: true }).click();
  await page.getByRole("tab", { name: "Analisis Soal", exact: true }).click();
  const select = page.getByRole("combobox", { name: "Pilih soal", exact: true });
  await expect(select).toBeVisible();
  await expect(select.locator("option")).toHaveCount(11);
  await select.selectOption(`701:${revisedQuestion.fingerprint}`);
  await expect(detail(page)).toContainText("Versi 2");
  await expect(detail(page)).toContainText(revisedQuestion.question);
  await expect(detail(page)).toContainText("Penyebut: 1 attempt menerima versi ini.");
  await expect(page.getByRole("combobox", { name: "Bentuk soal", exact: true })).toHaveCount(0);
});

test("mocked result tabs support keyboard and linked panels", async ({ page }) => {
  await mockReports(page);
  await openResults(page);
  await page.getByRole("tab", { name: "Ringkasan", exact: true }).focus();
  for (const [key, name] of [["ArrowRight", "Daftar Nilai"], ["End", "Hasil Siswa"], ["Home", "Ringkasan"]]) {
    await page.keyboard.press(key);
    const tab = page.getByRole("tab", { name, exact: true });
    const panel = page.getByRole("tabpanel", { name, exact: true });
    await expect(tab).toBeFocused();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(panel).toBeVisible();
    await expect(tab).toHaveAttribute("aria-controls", (await panel.getAttribute("id"))!);
    await expect(panel).toHaveAttribute("aria-labelledby", (await tab.getAttribute("id"))!);
  }
});

test("mocked hardest navigation reveals exact later page and alternate form", async ({ page }) => {
  const api = await mockReports(page);
  api.questions = [...reportQuestions].sort((a, b) => a.correct_percentage - b.correct_percentage || b.number - a.number);
  await openResults(page);
  await expect(page.getByRole("button", { name: /^Lihat analisis soal \d+$/ })).toHaveCount(5);
  await page.getByRole("button", { name: "Lihat analisis soal 10", exact: true }).click();
  await expect(list(page).getByRole("button").filter({ hasText: "Soal 10 ·" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("navigation", { name: "Halaman soal", exact: true })).toContainText("Halaman 2 dari 2");
  await expect(detail(page)).toContainText(questions[9].question);
  await page.getByLabel("Cari soal", { exact: true }).fill("tidak ada");
  await page.getByRole("tab", { name: "Ringkasan", exact: true }).click();
  await page.getByRole("button", { name: "Lihat analisis soal 2", exact: true }).click();
  await expect(page.getByLabel("Cari soal", { exact: true })).toHaveValue("");
  await expect(detail(page)).toContainText(questions[1].question);
  api.hardest = [revisedQuestion];
  await page.getByRole("tab", { name: "Ringkasan", exact: true }).click();
  await page.getByRole("button", { name: /^Filter(?: laporan)?$/ }).click();
  await page.getByRole("searchbox", { name: "Nama siswa", exact: true }).fill("Rina");
  await page.getByRole("button", { name: "Terapkan filter", exact: true }).click();
  await page.getByRole("button", { name: "Lihat analisis soal 1", exact: true }).click();
  await expect(formButton(page, "B")).toHaveAttribute("aria-pressed", "true");
  await expect(detail(page)).toContainText(revisedQuestion.question);
});

test("mocked score distribution preserves backend range labels and counts", async ({ page }) => {
  await mockReports(page);
  await openResults(page);
  await expect(page.getByText("78,9", { exact: true })).toBeVisible();
  const chart = page.getByRole("figure");
  await expect(chart).toContainText("0–49");
  await expect(chart).toContainText("50–100");
  await expect(chart.getByText("2", { exact: true })).toHaveCount(2);
});

test("mocked grouped forms isolate counts and hide fingerprints until disclosure", async ({ page }) => {
  const api = await mockReports(page);
  await openResults(page);
  await page.getByRole("tab", { name: "Analisis Soal", exact: true }).click();
  const group = list(page).getByRole("button").filter({ hasText: "Soal 1 ·" });
  await expect(group).toHaveCount(1);
  await expect(group).toContainText("4 pengerjaan");
  await expect(group).not.toContainText("% benar");
  await expect(detail(page)).toContainText("66,7%");
  await expect(formButton(page, "A")).toContainText("3 pengerjaan");
  await expect(formButton(page, "B")).toContainText("1 pengerjaan");
  await formButton(page, "B").click();
  await expect(detail(page).getByText(revisedQuestion.question, { exact: true })).toBeVisible();
  await expect(detail(page).getByText(questions[0].question, { exact: true })).toHaveCount(0);
  await expect(detail(page)).toContainText("Dari 1 pengerjaan yang memakai soal ini.");
  await expect(detail(page).getByText("1 · 100%", { exact: true })).toBeVisible();
  await formButton(page, "A").click();
  await expect(detail(page)).toContainText("Dari 3 pengerjaan yang memakai soal ini.");
  await expect(detail(page).getByText("2 · 66,7%", { exact: true })).toBeVisible();
  await expect(detail(page).getByText("1 · 33,3%", { exact: true })).toBeVisible();
  const technical = detail(page).locator("details").filter({ hasText: "Detail teknis" });
  await expect(technical).not.toHaveAttribute("open", "");
  await expect(page.getByText(questions[0].fingerprint, { exact: false })).not.toBeVisible();
  await technical.locator("summary").click();
  await expect(technical).toContainText(questions[0].fingerprint);
  expect(api.requests.filter(url => url.pathname.endsWith("/reports"))).toHaveLength(1);
});

test("mocked question filters, sorting, pagination and empty search stay local", async ({ page }) => {
  const api = await mockReports(page);
  await openResults(page);
  await page.getByRole("tab", { name: "Analisis Soal", exact: true }).click();
  const pagination = page.getByRole("navigation", { name: "Halaman soal", exact: true });
  const previous = pagination.getByRole("button", { name: "Sebelumnya", exact: true });
  const next = pagination.getByRole("button", { name: "Berikutnya", exact: true });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(next).toBeDisabled();
  await list(page).getByRole("button").filter({ hasText: "Soal 10 ·" }).click();
  await expect(detail(page)).toContainText("Belum dijawab oleh peserta");
  await expect(detail(page).getByText("3 · 100%", { exact: true })).toBeVisible();
  await previous.click();
  await page.getByRole("combobox", { name: "Filter sesi", exact: true }).selectOption("reading");
  await expect(list(page).getByRole("button", { name: /^Soal / })).toHaveCount(1);
  await expect(detail(page)).toContainText(questions[8].question);
  await page.getByRole("combobox", { name: "Filter sesi", exact: true }).selectOption("all");
  await page.getByRole("combobox", { name: "Urutan soal", exact: true }).selectOption("correct");
  await expect(list(page).getByRole("button", { name: /^Soal / }).nth(1)).toContainText("Soal 2 ·");
  await expect(list(page).getByRole("button", { name: /^Soal / }).nth(2)).toContainText("Soal 10 ·");
  await page.getByLabel("Cari soal", { exact: true }).fill(revisedQuestion.question);
  await expect(detail(page)).toContainText(revisedQuestion.question);
  await expect(formButton(page, "B")).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Cari soal", { exact: true }).fill("tidak-ada-snapshot-ini");
  await expect(page.getByRole("heading", { name: "Tidak ada soal ditemukan", exact: true })).toBeVisible();
  await expect(pagination).toHaveCount(0);
  expect(api.requests.filter(url => url.pathname.endsWith("/reports"))).toHaveLength(1);
});

test("mocked global filters apply only on submit and export shares backend scope", async ({ page }) => {
  const api = await mockReports(page);
  await openResults(page);
  await expect(page.getByRole("searchbox", { name: "Nama siswa", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Daftar Nilai", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Urutan hasil", exact: true })).toHaveValue("latest");
  await page.getByRole("navigation", { name: "Halaman siswa", exact: true }).getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(resultButton(page)).toHaveAccessibleName("Lihat hasil Rina Mock, pengerjaan 102");
  await page.getByRole("button", { name: /^Filter(?: laporan)?$/ }).click();
  await page.getByRole("searchbox", { name: "Nama siswa", exact: true }).fill("Rina");
  await page.getByRole("combobox", { name: /Status (?:hasil|kelulusan)/ }).selectOption("passed");
  await page.getByLabel(/^(?:Dari tanggal|Selesai sejak)$/).fill("2026-10-01");
  await page.getByLabel(/^(?:Sampai tanggal|Selesai sampai)$/).fill("2026-10-31");
  expect(api.requests.some(url => url.searchParams.has("search"))).toBe(false);
  await page.getByRole("button", { name: "Terapkan filter", exact: true }).click();
  const filters = { search: "Rina", status: "passed", date_from: "2026-10-01", date_to: "2026-10-31" };
  const hasFilters = (url: URL) => Object.entries(filters).every(([key, value]) => url.searchParams.get(key) === value);
  await expect.poll(() => api.requests.some(url => url.pathname.endsWith("/participants") && hasFilters(url) && url.searchParams.get("page") === "1" && url.searchParams.get("per_page") === "20")).toBe(true);
  await expect.poll(() => api.requests.some(url => url.pathname.endsWith("/reports") && hasFilters(url))).toBe(true);
  await page.getByRole("button", { name: "Filter laporan (4)", exact: true }).click();
  await page.getByRole("searchbox", { name: "Nama siswa", exact: true }).fill("Draft bukan cakupan ekspor");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh Excel", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("try-out-7-hasil.xlsx");
  expect(Object.fromEntries(api.requests.find(url => url.pathname.endsWith("/export.xlsx"))!.searchParams)).toEqual(filters);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Nama siswa", exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Terapkan filter", exact: true }).click();
  await expect.poll(() => Object.fromEntries(api.requests.filter(url => url.pathname.endsWith("/reports")).at(-1)!.searchParams)).toEqual({ status: "all" });
});

test("mocked package change clears selected forms, individual result and draft filters", async ({ page }) => {
  const api = await mockReports(page);
  await openResults(page);
  await page.getByRole("tab", { name: "Analisis Soal", exact: true }).click();
  await formButton(page, "B").click();
  await page.getByRole("tab", { name: "Daftar Nilai", exact: true }).click();
  await resultButton(page).click();
  await expect(page.getByRole("heading", { name: "Rina Mock", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filter laporan", exact: true }).click();
  await page.getByRole("searchbox", { name: "Nama siswa", exact: true }).fill("Draft belum diterapkan");
  await page.getByRole("combobox", { name: "Paket Try Out", exact: true }).selectOption("8");
  await expect(page.getByRole("tab", { name: "Ringkasan", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => api.requests.some(url => url.pathname === "/api/admin/try-outs/8/reports" && !url.searchParams.has("search"))).toBe(true);
  await page.getByRole("button", { name: "Filter laporan", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Nama siswa", exact: true })).toHaveValue("");
  await page.getByRole("tab", { name: "Hasil Siswa", exact: true }).click();
  await expect(page.getByRole("button", { name: "Buka Daftar Nilai", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Analisis Soal", exact: true }).click();
  await expect(formButton(page, "A")).toHaveAttribute("aria-pressed", "true");
});

test("mocked individual history and answer accordions use real completed attempts", async ({ page }) => {
  const api = await mockReports(page);
  await openResults(page);
  await page.getByRole("tab", { name: "Hasil Siswa", exact: true }).click();
  await page.getByRole("button", { name: "Buka Daftar Nilai", exact: true }).click();
  await resultButton(page).click();
  await expect(page.getByRole("heading", { name: "Rina Mock", exact: true })).toBeVisible();
  await expect(answer(page)).not.toHaveAttribute("open", "");
  await answer(page).locator("summary").click();
  await expect(page.getByText("Pembahasan snapshot tersimpan", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Filter jawaban", exact: true }).selectOption("unanswered");
  await expect(answer(page)).toHaveCount(0);
  await expect(page.locator("summary").filter({ hasText: /^Soal 10 ·/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Filter jawaban", exact: true }).selectOption("wrong");
  await expect(answer(page)).toBeVisible();
  const history = page.getByRole("combobox", { name: "Riwayat pengerjaan", exact: true });
  await expect(history.locator("option")).toHaveCount(2);
  await history.selectOption("102");
  await expect(page.getByRole("combobox", { name: "Filter jawaban", exact: true })).toHaveValue("all");
  await answer(page).locator("summary").click();
  await expect(page.getByText("Jawaban siswa: A · Kunci: A", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Filter jawaban", exact: true }).selectOption("wrong");
  await expect(page.getByText("Tidak ada jawaban sesuai filter.", { exact: true })).toBeVisible();
  expect(api.requests.filter(url => /\/attempts\//.test(url.pathname)).map(url => url.pathname)).toEqual(["/api/admin/try-outs/7/reports/attempts/101", "/api/admin/try-outs/7/reports/attempts/102"]);
  await page.getByRole("button", { name: "Kembali ke daftar nilai", exact: true }).click();
  await expect(resultButton(page)).toBeVisible();
});

test("mocked report loading remains visible until API resolves", async ({ page }) => {
  await mockReports(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/try-outs/7/reports?*", async route => { await pending; await route.fallback(); });
  await openResults(page);
  try { await expect(page.getByRole("status").filter({ hasText: "Memuat laporan…" })).toBeVisible(); }
  finally { release(); }
  await expect(page.getByRole("heading", { name: "Pengerjaan selesai", exact: true })).toBeVisible();
});

test("mocked empty results remain empty across four tabs", async ({ page }) => {
  const api = await mockReports(page);
  api.empty = true;
  await openResults(page);
  for (const tab of ["Ringkasan", "Daftar Nilai", "Analisis Soal", "Hasil Siswa"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    if (tab === "Hasil Siswa") await expect(page.getByRole("button", { name: "Buka Daftar Nilai", exact: true })).toBeVisible();
    else await expect(page.getByRole("heading", { name: tab === "Daftar Nilai" ? "Siswa tidak ditemukan" : "Belum ada hasil sesuai filter", exact: true })).toBeVisible();
    await expect(resultButton(page)).toHaveCount(0);
  }
});

for (const target of ["reports", "participants", "attempt", "export"] as const) {
  test(`mocked ${target} error remains visible and retry succeeds`, async ({ page }) => {
    const api = await mockReports(page);
    const path = `/api/admin/try-outs/7/reports${({ reports: "", participants: "/participants", attempt: "/attempts/101", export: "/export.xlsx" })[target]}`;
    api.failures.add(path);
    await openResults(page);
    if (target === "participants" || target === "attempt") await page.getByRole("tab", { name: "Daftar Nilai", exact: true }).click();
    if (target === "attempt") await resultButton(page).click();
    if (target === "export") await page.getByRole("button", { name: "Unduh Excel", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
    api.failures.delete(path);
    if (target === "export") {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Unduh Excel", exact: true }).click();
      await download;
    } else {
      await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
      if (target === "reports") await expect(page.getByRole("heading", { name: "Pengerjaan selesai", exact: true })).toBeVisible();
      if (target === "participants") await expect(resultButton(page)).toBeVisible();
      if (target === "attempt") await expect(page.getByRole("heading", { name: "Rina Mock", exact: true })).toBeVisible();
    }
    await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toHaveCount(0);
  });
}
