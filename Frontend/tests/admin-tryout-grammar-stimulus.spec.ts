import { expect, test, type Page } from "./canonical-fixture";

// Explicit in-memory API only. No backend or database; studio save/reload round-trip is mocked.
const question = (id: number, session: string, passage_id: number | null = null) => ({ id, session, passage_id, question: `Pertanyaan ${id}`, options: { A: "Satu", B: "Dua", C: "Tiga", D: "Empat" }, correct_option: "A", explanation: "", reading_passage: null, audio_url: null, point_value: 1, sort_order: id, status: "draft" });
async function mockStudio(page: Page, checkpoint = false) {
  const endpoint = checkpoint ? "checkpoint-packages" : "try-outs";
  let saved = { id: 7, program_id: 1, title: "Mock stimulus studio", studio_revision: "r1", max_score: 180, sort_order: 1, status: "draft", total_passing_score: null, session_passing_scores: null, passages: [{ id: 50, title: "Reading only", body: "Bacaan Reading" }, { id: 51, title: "Grammar only", body: "Stimulus lama" }], questions: [question(1, "grammar"), question(2, "grammar", 51), question(3, "reading", 50)] };
  const writes: { passages: typeof saved.passages; questions: { id: string; content: ReturnType<typeof question> }[]; deleted_question_ids: number[]; deleted_passage_ids: number[] }[] = [];
  await page.route(`**/api/admin/${endpoint}**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "PUT" && path.endsWith("/studio")) {
      const body = route.request().postDataJSON();
      writes.push(body);
      const ids = new Map(body.passages.map((item: { id: string }, index: number) => [String(item.id), /^\d+$/.test(item.id) ? Number(item.id) : 100 + index]));
      saved = { ...saved, studio_revision: `r${writes.length + 1}`, passages: body.passages.map((item: { id: string; title: string; body: string }) => ({ ...item, id: ids.get(String(item.id)) as number })), questions: body.questions.map((item: { id: string; content: ReturnType<typeof question> }, index: number) => ({ ...item.content, id: /^\d+$/.test(item.id) ? Number(item.id) : 200 + index, passage_id: item.content.passage_id == null ? null : ids.get(String(item.content.passage_id)) })) };
      return route.fulfill({ json: { data: saved } });
    }
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: { data: path.endsWith(`/${endpoint}`) ? [saved] : saved } });
  });
  return { writes, saved: () => saved };
}
async function openStudio(page: Page, checkpoint = false) {
  await page.goto(checkpoint ? "/admin/checkpoint" : "/admin/try-out");
  await page.getByRole("row").filter({ hasText: "Mock stimulus studio" }).getByRole("button", { name: "Detail", exact: true }).click();
  await page.getByRole("button", { name: "Kelola Soal", exact: true }).click();
  await page.getByRole("tab", { name: "Tata Bahasa", exact: true }).click();
}

test("mocked Try Out grammar shared stimulus creates, edits, reorders, deletes, saves and reloads without Reading leakage", async ({ page }) => {
  const api = await mockStudio(page);
  await openStudio(page);
  await expect(page.getByRole("region", { name: "HIRU TRY OUT STUDIO", exact: true })).toHaveAttribute("data-assessment-kind", "tryout");
  await expect(page.getByLabel("Hubungkan ke grup stimulus")).toHaveText(/Grammar only/);
  await expect(page.getByLabel("Hubungkan ke grup stimulus")).not.toHaveText(/Reading only/);
  await expect(page.getByRole("textbox", { name: "Bacaan Mandiri", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Pratinjau Siswa", exact: true }).click();
  await expect(page.getByRole("region", { name: "Pratinjau Siswa" }).getByLabel("Teks bacaan")).toHaveCount(0);
  await page.getByRole("tab", { name: "Editor", exact: true }).click();
  await page.getByRole("button", { name: "Tambah Grup Stimulus", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Grup Stimulus Tata Bahasa", exact: true });
  await dialog.getByLabel("Judul internal stimulus", { exact: true }).fill("Grammar new");
  await dialog.getByRole("textbox", { name: "Teks stimulus grup", exact: true }).fill("Stimulus baru");
  await dialog.getByLabel("Jumlah soal awal").fill("2");
  await dialog.getByRole("button", { name: "Buat Grup", exact: true }).click();
  for (const prompt of ["Grammar pertama", "Grammar kedua"]) {
    await page.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill(prompt);
    for (const letter of ["A", "B", "C", "D"]) await page.getByRole("textbox", { name: `Pilihan ${letter}`, exact: true }).fill(letter);
    await page.getByLabel("Jawaban Benar").selectOption("0");
    await page.getByText("Pengaturan soal", { exact: true }).click();
    await page.getByLabel("Bobot poin", { exact: true }).fill("1");
    if (prompt === "Grammar pertama") await page.getByRole("button", { name: "Soal Berikutnya", exact: true }).click();
  }
  await page.getByRole("textbox", { name: "Stimulus Bersama", exact: true }).fill("Stimulus diubah");
  await page.getByText("Aksi soal", { exact: true }).click();
  await page.getByRole("button", { name: "Naikkan Soal", exact: true }).click();
  await page.getByText("Aksi grup stimulus", { exact: true }).click();
  await page.getByRole("button", { name: "Grup Sebelumnya", exact: true }).click();
  await page.getByRole("tab", { name: "Pratinjau Siswa", exact: true }).click();
  await expect(page.getByLabel("Teks stimulus", { exact: true })).toContainText("Stimulus diubah");
  await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(1);
  const group = api.saved().passages.find(item => item.title === "Grammar new")!;
  expect(api.saved().questions.filter(item => item.passage_id === group.id).sort((a, b) => a.sort_order - b.sort_order).map(item => item.question)).toEqual(["Grammar kedua", "Grammar pertama"]);
  await openStudio(page);
  await page.getByRole("button").filter({ hasText: "Grammar kedua" }).click();
  await expect(page.getByRole("textbox", { name: "Stimulus Bersama", exact: true })).toContainText("Stimulus diubah");
  await page.getByText("Aksi soal", { exact: true }).click();
  await page.getByRole("button", { name: "Hapus Soal", exact: true }).click();
  await page.getByRole("button", { name: "Hapus dari Editor", exact: true }).click();
  await page.getByRole("button").filter({ hasText: "Grammar pertama" }).click();
  await page.getByText("Aksi grup stimulus", { exact: true }).click();
  await page.getByRole("button", { name: "Hapus Grup", exact: true }).click();
  await page.getByRole("button", { name: "Hapus dari Editor", exact: true }).click();
  await page.getByRole("tab", { name: "Reading (Dokkai)", exact: true }).click();
  await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
  await expect(page.getByLabel("Hubungkan ke grup bacaan")).toHaveText(/Reading only/);
  await expect(page.getByLabel("Hubungkan ke grup bacaan")).not.toHaveText(/Grammar only/);
  // Remove blank inspection question before saving.
  await page.getByText("Aksi soal", { exact: true }).click();
  await page.getByRole("button", { name: "Hapus Soal", exact: true }).click();
  await page.getByRole("button", { name: "Hapus dari Editor", exact: true }).click();
  await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(2);
  expect(api.writes[1].deleted_passage_ids).toContain(group.id);
  expect(api.writes[1].deleted_question_ids).toHaveLength(2);
  await openStudio(page);
  await expect(page.getByText("Grammar new", { exact: true })).toHaveCount(0);
});

test("mocked Checkpoint grammar keeps existing standalone behavior", async ({ page }) => {
  await mockStudio(page, true);
  await openStudio(page, true);
  await expect(page.getByRole("button", { name: "Tambah Grup Stimulus", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Hubungkan ke grup stimulus")).toHaveCount(0);
  await page.getByRole("tab", { name: "Reading (Dokkai)", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tambah Grup Bacaan", exact: true })).toBeVisible();
});
