import { expect, test, type Page } from "./canonical-fixture";

test("duration edit validates, persists on refresh, and clears to null", async ({ page }) => {
  const api = await mock(page);
  await page.goto("/admin/try-out");
  const row = page.getByRole("row").filter({ hasText: "Try Out 7" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const duration = page.getByLabel("Durasi (menit)", { exact: true });
  await expect(duration).toBeEnabled();
  for (const value of ["0", "-1", "1.5"]) {
    await duration.fill(value);
    await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("bilangan bulat positif");
    expect(api.writes).toHaveLength(0);
  }
  await duration.fill("90");
  await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.writes[0].body).toMatchObject({ duration_minutes: 90 });
  expect(api.writes.filter(write => write.path.includes("/questions"))).toHaveLength(0);
  await page.reload();
  await expect(row).toContainText("90 menit");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(duration).toHaveValue("90");
  await duration.fill("");
  await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.writes[2].body).toMatchObject({ duration_minutes: null });
  await page.reload();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(duration).toHaveValue("");
});

const sessions = ["vocabulary_kanji", "grammar", "reading", "audio"];
const labels = ["Kosakata & Kanji", "Tata Bahasa", "Reading / Dokkai", "Audio / Choukai"];
function fixture(id = 7) {
  return { id, program_id: 1, title: `Try Out ${id}`, status: "draft", total_passing_score: 1, questions: sessions.flatMap((session, section) => Array.from({ length: 25 }, (_, index) => ({ id: id * 1000 + section * 25 + index, session, question: `Question ${section}-${index}`, options: { A: "First", B: "Second", C: "Third", D: "Fourth" }, correct_option: "A", explanation: "", reading_passage: session === "reading" ? "Passage" : null, audio_url: session === "audio" ? "media/audio.mp3" : null, point_value: index < 20 ? 2 : 1, sort_order: index, status: "draft" }))) };
}
async function mock(page: Page, items = [fixture()]) {
  const writes: { path: string; method: string; body: unknown }[] = [];
  let release: (() => void) | undefined;
  let failure = 0;
  let hold = false;
  await page.route("**/api/admin/try-outs**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const item = items.find(item => item.id === Number(path.split("/")[4]));
    if (request.method() === "GET") { await route.fulfill({ json: { data: item ?? items } }); return; }
    writes.push({ path, method: request.method(), body: request.postData() ? request.postDataJSON() : null });
    if (hold) await new Promise<void>(resolve => { release = resolve; });
    if (failure) { await route.fulfill({ status: failure, json: { errors: { "questions.0.audio_url": ["Audio is required."] } } }); return; }
    if (path.endsWith("/questions/publish")) {
      item!.questions.forEach(question => { question.status = "published"; });
      await route.fulfill({ json: { data: { try_out_id: item!.id, published_count: item!.questions.length } } }); return;
    }
    const body = request.postDataJSON();
    if (path.includes("/questions/")) Object.assign(item!.questions.find(question => question.id === Number(path.split("/").at(-1)))!, body);
    else Object.assign(item!, body);
    await route.fulfill({ json: { data: item } });
  });
  return { writes, hold: () => { hold = true; }, release: () => { hold = false; release?.(); }, fail: (status: number) => { failure = status; } };
}

test("bulk publish is explicit, guarded, scoped, and parent publish only patches status", async ({ page }) => {
  const api = await mock(page, [fixture(), fixture(8)]);
  await page.goto("/admin/try-out");
  const row = page.getByRole("row").filter({ hasText: "Try Out 7" });
  await expect(row).toContainText("100 Draft • 0 Published");
  api.hold();
  await row.getByRole("button", { name: "Publish Semua Soal", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => api.writes.length).toBe(1);
  const publishing = row.getByRole("button", { name: "Mempublikasikan Semua Soal…", exact: true });
  await expect(publishing).toBeDisabled();
  await expect(publishing).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("row").filter({ hasText: "Try Out 8" }).getByRole("button", { name: "Publish Semua Soal", exact: true })).toHaveAttribute("aria-busy", "false");
  expect(api.writes[0]).toEqual({ path: "/api/admin/try-outs/7/questions/publish", method: "POST", body: null });
  api.release();
  await expect(row).toContainText("0 Draft • 100 Published");
  await expect(page.getByRole("row").filter({ hasText: "Try Out 8" })).toContainText("100 Draft • 0 Published");
  api.hold();
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(2);
  await expect(row.getByRole("button", { name: "Mempublikasikan…", exact: true })).toHaveAttribute("aria-busy", "true");
  api.release();
  await expect(row.getByRole("button", { name: "Draft", exact: true })).toHaveAttribute("aria-busy", "false");
  expect(api.writes).toHaveLength(2);
  expect(api.writes[1]).toEqual({ path: "/api/admin/try-outs/7", method: "PATCH", body: { status: "published" } });
});

test("zero order draft saves patch only edited question and never bulk publish", async ({ page }) => {
  const api = await mock(page);
  await page.goto("/admin/try-out");
  await page.getByRole("row").filter({ hasText: "Try Out 7" }).getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Edit Question 0-0", exact: true }).click();
  const question = page.getByRole("dialog");
  await expect(question.getByLabel("Urutan", { exact: true })).toHaveAttribute("min", "0");
  await question.getByLabel("Urutan", { exact: true }).fill("-1");
  await question.getByRole("button", { name: "Simpan Soal", exact: true }).click();
  await expect(question.getByRole("alert")).toContainText("nonnegatif");
  await question.getByLabel("Urutan", { exact: true }).fill("0");
  await question.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Edited question");
  await question.getByRole("button", { name: "Simpan Soal", exact: true }).click();
  api.hold();
  await page.getByRole("dialog").getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(1);
  const saving = page.getByRole("dialog").getByRole("button", { name: "Menyimpan Try Out…", exact: true });
  await expect(saving).toBeDisabled();
  await expect(saving).toHaveAttribute("aria-busy", "true");
  api.release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const questionWrites = api.writes.filter(write => write.path.includes("/questions"));
  expect(questionWrites).toHaveLength(1);
  expect(questionWrites[0].path).toBe("/api/admin/try-outs/7/questions/7000");
  expect(questionWrites[0].body).toMatchObject({ sort_order: 0, question: "Edited question", status: "draft" });
});

test("reorder stays zero based locally and bulk publish cannot alter open draft", async ({ page }) => {
  const api = await mock(page);
  await page.goto("/admin/try-out");
  const row = page.getByRole("row").filter({ hasText: "Try Out 7" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Turun Question 0-0", exact: true }).click();
  await page.getByRole("button", { name: "Edit Question 0-1", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Urutan", { exact: true })).toHaveValue("0");
  await dialog.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Unsaved prompt");
  await expect(row.getByRole("button", { name: "Publish Semua Soal", exact: true })).toBeDisabled();
  await row.getByRole("button", { name: "Publish Semua Soal", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); });
  await expect(dialog.getByRole("textbox", { name: "Pertanyaan", exact: true })).toHaveValue("Unsaved prompt");
  await expect(dialog.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("Draft");
  expect(api.writes).toEqual([]);
});

for (const [status, text] of [[401, "Sesi berakhir"], [403, "Akses admin"], [422, "questions.0.audio_url: Audio is required."], [429, "Terlalu banyak"], [500, "Server mengalami gangguan"]] as const) {
  test(`bulk publish ${status} preserves rows and allows retry`, async ({ page }) => {
    const api = await mock(page);
    api.fail(status);
    await page.goto("/admin/try-out");
    const row = page.getByRole("row").filter({ hasText: "Try Out 7" });
    await row.getByRole("button", { name: "Publish Semua Soal", exact: true }).click();
    if (status === 401) {
      await expect(page).toHaveURL(/\/login/);
      api.fail(0);
      await page.goto("/admin/try-out");
    } else await expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();
    await expect(row).toContainText("100 Draft • 0 Published");
    await expect(row.getByRole("button", { name: "Publish Semua Soal", exact: true })).toBeEnabled();
  });
}

test("preview grades correct counts across all four sessions independently of weighted total", async ({ page }) => {
  const api = await mock(page, [fixture(), fixture(8)]);
  await page.goto("/admin/try-out");
  await page.getByRole("row").filter({ hasText: "Try Out 7" }).getByRole("button", { name: "Lihat", exact: true }).click();
  const preview = page.getByRole("region", { name: "Pratinjau Try Out" });
  await expect(preview.getByText("ID: 7", { exact: true })).toBeVisible();
  await expect(preview.getByText("Lulus jika keempat sesi masing-masing memiliki minimal 19 jawaban benar. Try Out dapat diulang tanpa batas.", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Hasil", exact: true }).click();
  await expect(preview.getByRole("status")).toHaveText("Belum ada jawaban pratinjau.");
  await preview.getByRole("button", { name: "Runner", exact: true }).click();
  for (let section = 0; section < 4; section++) {
    await preview.getByRole("button", { name: `${labels[section]} • 25 soal`, exact: true }).click();
    for (let index = 0; index < (section === 3 ? 18 : 19); index++) {
      await preview.getByRole("button", { name: `Soal ${section * 25 + index + 1}`, exact: true }).click();
      await preview.getByRole("radio").first().check();
    }
  }
  await preview.getByRole("button", { name: "Hasil", exact: true }).click();
  await expect(preview.getByRole("status")).toHaveText("TIDAK LULUS");
  await expect(preview.locator(".tryout-total-score strong")).toHaveText("150");
  await expect(preview.locator(".tryout-total-score em")).toHaveText("/ 180");
  await preview.getByRole("button", { name: "Runner", exact: true }).click();
  await preview.getByRole("button", { name: "Soal 94", exact: true }).click();
  await preview.getByRole("radio").first().check();
  await preview.getByRole("button", { name: "Hasil", exact: true }).click();
  await expect(preview.getByRole("status")).toHaveText("LULUS");
  await page.keyboard.press("Escape");
  await page.getByRole("row").filter({ hasText: "Try Out 8" }).getByRole("button", { name: "Lihat", exact: true }).click();
  await expect(preview.getByText("ID: 8", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Runner", exact: true }).click();
  await expect(preview.getByRole("radio").first()).not.toBeChecked();
  expect(api.writes).toEqual([]);
});
