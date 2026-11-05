import { expect, test, type Page } from "./canonical-fixture";

// Explicit API mocks only: no backend, database, or assertion that stub bytes form XLSX.
const tryOut = { id: 7, title: "Try Out Reports", level: "N5" };
const options = { A: "Pilihan pertama", B: "Pilihan kedua", C: "Pilihan ketiga", D: "Pilihan keempat" };
const questions = Array.from({ length: 10 }, (_, index) => {
  const number = index + 1;
  const blank = number === 10;
  const correct = number === 2 || blank ? 0 : 2;
  const wrong = number === 2 ? 2 : 0;
  return { version: `7:${number}`, id: 700 + number, fingerprint: `snapshot-${number}-${"a".repeat(48)}`, section: number === 9 ? "reading" : "grammar", number, question: `Pertanyaan snapshot ${number}`, options, correct_option: "A", received: 3, not_received: 1, correct, wrong, unanswered: blank ? 3 : 1, correct_percentage: correct ? 66.67 : 0, distribution: { A: { count: correct, percentage: correct ? 66.67 : 0 }, B: { count: wrong, percentage: wrong ? 66.67 : 0 }, C: { count: 0, percentage: 0 }, D: { count: 0, percentage: 0 } } };
});
const revisedQuestion = { ...questions[0], version: "7:1:revision", fingerprint: `snapshot-1-${"b".repeat(48)}`, question: "Pertanyaan snapshot 1 revisi" };
const reportQuestions = [...questions, revisedQuestion];
const hardest = [questions[1], questions[9], ...questions.slice(2, 8)];
const participant = (id: number) => ({ id, user_id: 91, name: "Rina Mock", whatsapp: "628123456789", started_at: "2026-10-01T01:00:00Z", completed_at: "2026-10-01T02:00:00Z", status: "completed", raw_score: id === 101 ? 30 : 70, final_score: id === 101 ? 30 : 70, max_score: 100, overall_pass: id !== 101, sessions: [{ code: "grammar", label: "Tata Bahasa", earned: id === 101 ? 0 : 2, max: 2, correct: id === 101 ? 0 : 1, wrong: id === 101 ? 1 : 0, unanswered: 0, pass: id !== 101 }] });
const attempts = [101, 102].map(id => participant(id));

async function mockReports(page: Page) {
  const state = { empty: false, failures: new Set<string>(), requests: [] as URL[] };
  await page.route("**/api/admin/try-outs**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    state.requests.push(url);
    expect(route.request().method()).toBe("GET");
    if (state.failures.has(path)) return route.fulfill({ status: 500, json: { message: "Mock report unavailable" } });
    if (path.endsWith("/export.xlsx")) return route.fulfill({ contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: "explicit mocked export response" });
    if (/\/attempts\/\d+$/.test(path)) {
      const id = Number(path.split("/").at(-1));
      return route.fulfill({ json: { data: { try_out: tryOut, participant: participant(id), attempts, questions: [{ ...questions[1], session: "grammar", answer: id === 101 ? "B" : "A", explanation: "Pembahasan snapshot tersimpan", point_value: 2, earned: id === 101 ? 0 : 2, outcome: id === 101 ? "wrong" : "correct" }] } } });
    }
    if (path.endsWith("/participants")) {
      const current = Number(url.searchParams.get("page") ?? 1);
      return route.fulfill({ json: { data: state.empty ? [] : [participant(current === 1 ? 101 : 102)], meta: { current_page: current, last_page: state.empty ? 1 : 2, total: state.empty ? 0 : 21, per_page: 20 } } });
    }
    if (path.endsWith("/reports")) return route.fulfill({ json: { data: { try_out: tryOut, summary: { responses: state.empty ? 0 : 4, unique_participants: 1, mean: 50, median: 50, min: 30, max: 70, passed: 2, failed: 2 }, histogram: state.empty ? [] : [{ label: "0–49", count: 2 }, { label: "50–100", count: 2 }], questions: state.empty ? [] : reportQuestions, hardest: state.empty ? [] : hardest } } });
    if (path === "/api/admin/try-outs") return route.fulfill({ json: { data: [{ ...tryOut, program_id: 1, status: "published", sort_order: 1, max_score: 100, total_passing_score: 60, questions: [] }] } });
    if (path === "/api/admin/try-outs/7") return route.fulfill({ json: { data: { ...tryOut, program_id: 1, status: "published", questions: [] } } });
    throw new Error(`Unexpected mocked try-out endpoint: ${path}`);
  });
  return state;
}

async function openResults(page: Page) {
  await page.goto("/admin/try-out");
  await page.getByRole("row").filter({ hasText: tryOut.title }).getByRole("button", { name: "Hasil & Analitik", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Analisis Hasil Try Out", exact: true })).toBeVisible();
}

async function noOverflow(page: Page) {
  await expect.configure({ soft: true }).poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

for (const width of [1440, 768, 390]) {
  test(`mocked results: all four tabs fit actual admin route at ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && /hydration|server rendered/i.test(message.text())) errors.push(message.text()); });
    await page.setViewportSize({ width, height: 1000 });
    await mockReports(page);
    await openResults(page);
    await expect(page.getByRole("heading", { name: "Total attempt selesai", exact: true })).toBeVisible();
    for (const tab of ["Ringkasan", "Peserta", "Analisis Soal", "Individual"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true");
      if (tab === "Peserta" || tab === "Individual") await expect(page.getByRole("button", { name: "Detail Individual", exact: true })).toBeVisible();
      if (tab === "Analisis Soal") {
        await expect(page.getByRole("combobox", { name: "Pilih soal", exact: true })).toHaveValue(`701:${questions[0].fingerprint}`);
        const detail = page.getByRole("article", { name: "Detail analisis soal", exact: true });
        await expect(detail.getByText("Pertanyaan snapshot 1", { exact: true })).toBeVisible();
        await expect(detail.getByRole("heading", { name: "Soal 1 — Tata Bahasa", exact: true })).toBeVisible();
        await expect(detail.getByRole("figure", { name: "Distribusi jawaban", exact: true }).locator("svg .recharts-bar-rectangle").first()).toBeVisible();
      }
      await expect(page.getByRole("tabpanel", { name: tab, exact: true })).toBeVisible();
      await noOverflow(page);
      if (tab === "Ringkasan" || tab === "Analisis Soal") {
        await expect(page.getByRole("figure", { name: tab === "Ringkasan" ? "Distribusi skor" : "Distribusi jawaban", exact: true }).locator("svg").first()).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`${tab === "Ringkasan" ? "summary" : "analysis"}-${width}.png`), fullPage: true, animations: "disabled" });
      }
    }
    await page.getByRole("button", { name: "Detail Individual", exact: true }).click();
    await expect(page.getByText("Jawaban: B · Kunci: A · Salah · Poin 0 / 2", { exact: true })).toBeVisible();
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("mocked result tabs support keyboard and linked panels", async ({ page }) => {
  await mockReports(page);
  await openResults(page);
  await page.getByRole("tab", { name: "Ringkasan", exact: true }).focus();
  for (const [key, name] of [["ArrowRight", "Peserta"], ["End", "Individual"], ["Home", "Ringkasan"]]) {
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

test("mocked hardest question selects exact snapshot analysis", async ({ page }) => {
  await mockReports(page);
  await openResults(page);
  await expect(page.getByRole("button", { name: /^Lihat analisis soal \d+$/ })).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Lihat analisis soal 6", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Lihat analisis soal 2", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Analisis Soal", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("combobox", { name: "Pilih soal", exact: true })).toHaveValue(`702:${questions[1].fingerprint}`);
  const detail = page.getByRole("article", { name: "Detail analisis soal", exact: true });
  await expect(detail.getByRole("heading", { name: "Soal 2 — Tata Bahasa", exact: true })).toBeVisible();
  await expect(detail.getByText("Pertanyaan snapshot 2", { exact: true })).toBeVisible();
  await expect(detail.getByText("Pertanyaan snapshot 1", { exact: true })).toHaveCount(0);
  await expect(detail.getByText("Penyebut: 3 attempt menerima versi ini. 1 attempt tidak menerima soal ini.", { exact: true })).toBeVisible();
  await expect(detail.getByText("Persentase benar", { exact: true })).toBeVisible();
  await expect(detail.getByText("0%", { exact: true }).first()).toBeVisible();
});

test("mocked score histogram renders SVG bars, tooltip, and disclosed data", async ({ page }) => {
  await mockReports(page);
  await openResults(page);
  const chart = page.getByRole("figure", { name: "Distribusi skor", exact: true });
  const bars = chart.locator("svg .recharts-bar-rectangle");
  await expect(bars).toHaveCount(2);
  for (const bar of await bars.all()) {
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box!.height).toBeGreaterThan(box!.width);
  }
  const totalCard = page.locator("section").filter({ has: page.getByRole("heading", { name: "Total attempt selesai", exact: true }) });
  await expect(totalCard).toContainText("4");
  await expect(page.getByText("Peserta unik:", { exact: false })).toContainText("1");
  await bars.first().hover();
  const tooltip = chart.locator(".recharts-tooltip-wrapper");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("0–49");
  await expect(tooltip).toContainText("2");
  const data = page.locator("details").filter({ has: page.getByText("Data distribusi skor", { exact: true }) });
  await expect(data).not.toHaveAttribute("open", "");
  await expect(data.getByRole("table")).not.toBeVisible();
  await data.locator("summary").click();
  const table = data.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3);
  for (const label of ["0–49", "50–100"]) {
    const row = table.getByRole("row").filter({ hasText: label });
    await expect(row.getByRole("cell", { name: "2", exact: true })).toBeVisible();
  }
});

test("mocked question versions hide fingerprints until technical disclosure", async ({ page }) => {
  await mockReports(page);
  await openResults(page);
  await page.getByRole("tab", { name: "Analisis Soal", exact: true }).click();
  const select = page.getByRole("combobox", { name: "Pilih soal", exact: true });
  await expect(select).toHaveValue(`701:${questions[0].fingerprint}`);
  const labels = await select.locator("option").allTextContents();
  expect(labels.some(label => /Versi 1/.test(label))).toBe(true);
  expect(labels.some(label => /Versi 2/.test(label))).toBe(true);
  for (const question of reportQuestions) expect(labels.join(" ")).not.toContain(question.fingerprint);
  await select.selectOption(`701:${revisedQuestion.fingerprint}`);
  const detail = page.getByRole("article", { name: "Detail analisis soal", exact: true });
  await expect(detail.getByText(revisedQuestion.question, { exact: true })).toBeVisible();
  await expect(detail.getByText(questions[0].question, { exact: true })).toHaveCount(0);
  const technical = detail.locator("details");
  await expect(technical).not.toHaveAttribute("open", "");
  await expect(page.getByText(revisedQuestion.fingerprint, { exact: false })).not.toBeVisible();
  await technical.locator("summary").click();
  await expect(technical).toContainText(revisedQuestion.fingerprint);
  await technical.locator("summary").click();
  await expect(technical).not.toHaveAttribute("open", "");
});

test("mocked question list filters, searches, and paginates locally", async ({ page }) => {
  const api = await mockReports(page);
  await openResults(page);
  await page.getByRole("tab", { name: "Analisis Soal", exact: true }).click();
  const pagination = page.getByRole("navigation", { name: "Halaman soal", exact: true });
  const previous = pagination.getByRole("button", { name: "Soal sebelumnya", exact: true });
  const next = pagination.getByRole("button", { name: "Soal berikutnya", exact: true });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(previous).toBeEnabled();
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(previous).toBeDisabled();
  const section = page.getByRole("combobox", { name: "Filter section", exact: true });
  await section.selectOption("reading");
  await expect(page.getByText("Pertanyaan snapshot 9", { exact: true }).first()).toBeVisible();
  await expect(next).toBeDisabled();
  await section.selectOption({ index: 0 });
  await page.getByLabel("Cari soal", { exact: true }).fill("Pertanyaan snapshot 1 revisi");
  await expect(page.getByText(revisedQuestion.question, { exact: true }).first()).toBeVisible();
  await expect(next).toBeDisabled();
  await page.getByLabel("Cari soal", { exact: true }).fill("tidak-ada-snapshot-ini");
  await expect(page.getByText("Tidak ada soal sesuai pencarian atau filter.", { exact: true })).toBeVisible();
  await expect(pagination).toHaveCount(0);
  expect(api.requests.filter(url => url.pathname.endsWith("/reports"))).toHaveLength(1);
});

test("mocked answer chart keeps counts and blank denominator accessible", async ({ page }) => {
  await mockReports(page);
  await openResults(page);
  await page.getByRole("tab", { name: "Analisis Soal", exact: true }).click();
  const detail = page.getByRole("article", { name: "Detail analisis soal", exact: true });
  const chart = detail.getByRole("figure", { name: "Distribusi jawaban", exact: true });
  const table = chart.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader")).toHaveText(["Pilihan", "Jumlah", "Persentase"]);
  await expect(table.getByRole("row")).toHaveCount(6);
  for (const [label, count, percentage] of [["A", "2", "66,67"], ["B", "0", "0"], ["C", "0", "0"], ["D", "0", "0"], ["Kosong", "1", "33,33"]]) {
    const row = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label === "A" ? "A — benar" : label, exact: true }) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("cell").nth(0)).toHaveText(count);
    await expect(row.getByRole("cell").nth(1)).toHaveText(new RegExp(`${percentage.replace(",", "[.,]")}\\s*%`));
  }
  const bars = chart.locator("svg .recharts-bar-rectangle");
  await expect(bars.first()).toBeVisible();
  await bars.first().hover();
  await expect(chart.locator(".recharts-tooltip-wrapper")).toBeVisible();
  await expect(chart.locator(".recharts-tooltip-wrapper")).toContainText("2");
  for (const text of Object.values(options)) await expect(detail.getByText(text, { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Pilih soal", exact: true }).selectOption(`710:${questions[9].fingerprint}`);
  await expect(detail.getByRole("heading", { name: "Soal 10 — Tata Bahasa", exact: true })).toBeVisible();
  await expect(detail.getByText("Belum dijawab oleh peserta", { exact: true })).toBeVisible();
  for (const label of ["A", "B", "C", "D", "Kosong"]) {
    const row = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label === "A" ? "A — benar" : label, exact: true }) });
    await expect(row.getByRole("cell").nth(0)).toHaveText(label === "Kosong" ? "3" : "0");
    await expect(row.getByRole("cell").nth(1)).toHaveText(label === "Kosong" ? /100\s*%/ : /0\s*%/);
  }
  await expect(chart.locator("svg .recharts-bar-rectangle").last()).toBeVisible();
});

test("mocked participant filters, pagination, and export request backend scope", async ({ page }) => {
  const api = await mockReports(page);
  await openResults(page);
  await page.getByRole("tab", { name: "Peserta", exact: true }).click();
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Halaman 2 / 2" })).toBeVisible();
  await page.getByLabel("Cari peserta", { exact: true }).fill("Rina");
  await page.getByRole("combobox", { name: "Hasil", exact: true }).selectOption("passed");
  await page.getByLabel("Selesai sejak", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Selesai sampai", { exact: true }).fill("2026-10-31");
  const filters = { search: "Rina", status: "passed", date_from: "2026-10-01", date_to: "2026-10-31" };
  const hasFilters = (url: URL) => Object.entries(filters).every(([key, value]) => url.searchParams.get(key) === value);
  await expect.poll(() => api.requests.some(url => url.pathname.endsWith("/participants") && hasFilters(url) && url.searchParams.get("page") === "1" && url.searchParams.get("per_page") === "20")).toBe(true);
  await expect.poll(() => api.requests.some(url => url.pathname.endsWith("/reports") && hasFilters(url))).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Halaman 1 / 2" })).toBeVisible();
  await page.getByRole("combobox", { name: "Hasil", exact: true }).selectOption("failed");
  await expect.poll(() => api.requests.some(url => url.pathname.endsWith("/participants") && url.searchParams.get("status") === "failed" && url.searchParams.get("search") === "Rina")).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh Excel", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("try-out-7-hasil.xlsx");
  const exported = api.requests.find(url => url.pathname.endsWith("/export.xlsx"));
  expect(exported).toBeDefined();
  expect(Object.fromEntries(exported!.searchParams)).toEqual({ ...filters, status: "failed" });
});

test("mocked individual detail switches completed attempts and snapshot choices", async ({ page }) => {
  const api = await mockReports(page);
  await openResults(page);
  await page.getByRole("tab", { name: "Individual", exact: true }).click();
  await page.getByRole("button", { name: "Detail Individual", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rina Mock", exact: true })).toBeVisible();
  await expect(page.getByText("Jawaban: B · Kunci: A · Salah · Poin 0 / 2", { exact: true })).toBeVisible();
  await expect(page.getByText("Pembahasan snapshot tersimpan", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Attempt selesai peserta ini", exact: true }).selectOption("102");
  await expect(page.getByText("Jawaban: A · Kunci: A · Benar · Poin 2 / 2", { exact: true })).toBeVisible();
  expect(api.requests.filter(url => /\/attempts\//.test(url.pathname)).map(url => url.pathname)).toEqual(["/api/admin/try-outs/7/reports/attempts/101", "/api/admin/try-outs/7/reports/attempts/102"]);
  await page.getByRole("button", { name: "Pilih Peserta / Attempt Lain", exact: true }).click();
  await expect(page.getByRole("button", { name: "Detail Individual", exact: true })).toBeVisible();
});

test("mocked report loading remains visible until API resolves", async ({ page }) => {
  await mockReports(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/try-outs/7/reports?*", async route => {
    await pending;
    await route.fallback();
  });
  await openResults(page);
  try { await expect(page.getByRole("status").filter({ hasText: "Memuat laporan…" })).toBeVisible(); }
  finally { release(); }
  await expect(page.getByRole("heading", { name: "Total attempt selesai", exact: true })).toBeVisible();
});

test("mocked empty results remain empty across all four tabs", async ({ page }) => {
  const api = await mockReports(page);
  api.empty = true;
  await openResults(page);
  for (const tab of ["Ringkasan", "Peserta", "Analisis Soal", "Individual"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.getByText("Belum ada attempt selesai sesuai filter.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Detail Individual", exact: true })).toHaveCount(0);
  }
});

for (const target of ["reports", "participants", "attempt", "export"] as const) {
  test(`mocked ${target} error remains visible and retry succeeds`, async ({ page }) => {
    const api = await mockReports(page);
    const path = `/api/admin/try-outs/7/reports${({ reports: "", participants: "/participants", attempt: "/attempts/101", export: "/export.xlsx" })[target]}`;
    api.failures.add(path);
    await openResults(page);
    if (target === "participants" || target === "attempt") await page.getByRole("tab", { name: "Peserta", exact: true }).click();
    if (target === "attempt") await page.getByRole("button", { name: "Detail Individual", exact: true }).click();
    if (target === "export") await page.getByRole("button", { name: "Unduh Excel", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toBeVisible();
    api.failures.delete(path);
    if (target === "export") {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Unduh Excel", exact: true }).click();
      await download;
    } else {
      await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
      if (target === "reports") await expect(page.getByRole("heading", { name: "Total attempt selesai", exact: true })).toBeVisible();
      if (target === "participants") await expect(page.getByRole("button", { name: "Detail Individual", exact: true })).toBeVisible();
      if (target === "attempt") await expect(page.getByText("Jawaban: B · Kunci: A · Salah · Poin 0 / 2", { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("alert").filter({ hasText: "Permintaan belum berhasil" })).toHaveCount(0);
  });
}
