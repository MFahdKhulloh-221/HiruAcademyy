import { expect, test } from "./canonical-fixture";

test("Reading studio saves real CRUD, keeps failed edits, and shares passages", async ({ page }) => {
  const passages = [{ id: 101, chapter_id: 1, title: "Bacaan Pembuka", body: "Ini adalah teks bacaan awal.", status: "published" }];
  const questions = [{ id: 201, reading_passage_id: 101, question: "Apa topik bacaan?", options: { A: "A", B: "B", C: "C", D: "D" }, correct_option: "A", explanation: "", sort_order: 1, status: "published" }];
  let fail = true;
  let writes = 0;
  let failCreate = true;
  const deleted: string[] = [];
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [{ id: 1, name: "JLPT N5", family: "jlpt" }] } }));
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 1, program_id: 1, title: "Chapter 1", chapter_number: 1, status: "published" }] } }));
  await page.route("**/api/admin/reading-passages**", async route => {
    if (route.request().method() === "POST") {
      const data = { ...route.request().postDataJSON(), id: 102 };
      passages.push(data);
      await route.fulfill({ status: 201, json: { data } });
    } else if (route.request().method() === "PATCH") {
      const passage = passages.find(item => route.request().url().endsWith(`/${item.id}`))!;
      Object.assign(passage, route.request().postDataJSON());
      await route.fulfill({ json: { data: passage } });
    } else await route.fulfill({ json: { data: passages } });
  });
  await page.route("**/api/admin/reading-questions**", async route => {
    if (route.request().method() === "DELETE") {
      deleted.push(route.request().url());
      await route.fulfill({ status: 204 });
    } else if (route.request().method() === "PATCH") {
      writes++;
      if (fail) { await route.fulfill({ status: 422, json: { message: "Simpan ditolak" } }); return; }
      const question = questions.find(item => route.request().url().endsWith(`/${item.id}`))!;
      Object.assign(question, route.request().postDataJSON());
      await route.fulfill({ json: { data: question } });
    } else if (route.request().method() === "POST") {
      if (failCreate) { await route.fulfill({ status: 422, json: { message: "Soal baru ditolak" } }); return; }
      const data = { ...route.request().postDataJSON(), id: 202 };
      questions.push(data);
      await route.fulfill({ status: 201, json: { data } });
    } else await route.fulfill({ json: { data: questions } });
  });
  await page.goto("/admin/reading-question");
  await page.getByRole("combobox", { name: "Program", exact: true }).selectOption("1");
  await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("1");
  const studio = page.getByRole("region", { name: "HIRU READING STUDIO", exact: true });
  await expect(studio.getByRole("complementary", { name: "Navigator Konten" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(studio.getByRole("tab", { name: "Audio (Choukai)" })).toHaveCount(0);
  await studio.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Pertanyaan diperbarui");
  await studio.getByRole("button", { name: "Simpan Reading", exact: true }).click();
  await expect(studio.getByRole("alert")).toContainText("Penyimpanan belum selesai");
  await expect(studio.getByRole("textbox", { name: "Pertanyaan", exact: true })).toContainText("Pertanyaan diperbarui");
  fail = false;
  await studio.getByRole("button", { name: "Simpan Reading", exact: true }).click();
  await expect(studio.getByRole("status")).toHaveText("Semua perubahan Reading tersimpan.");
  expect(writes).toBe(2);
  await studio.getByRole("button", { name: "Tambah Grup Bacaan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Grup Bacaan Reading", exact: true });
  await dialog.getByLabel("Judul internal bacaan", { exact: true }).fill("Bacaan Baru");
  await dialog.getByRole("textbox", { name: "Teks bacaan grup", exact: true }).fill("面接の準備をします。");
  await dialog.getByRole("spinbutton", { name: /^Jumlah soal awal/ }).fill("1");
  await dialog.getByRole("button", { name: "Buat Grup", exact: true }).click();
  await studio.getByRole("textbox", { name: "Pertanyaan", exact: true }).fill("Apa persiapannya?");
  for (const letter of ["A", "B", "C", "D"]) await studio.getByRole("textbox", { name: `Pilihan ${letter}`, exact: true }).fill(letter);
  await studio.getByRole("combobox", { name: "Jawaban Benar" }).selectOption("0");
  await studio.getByRole("button", { name: "Simpan Reading", exact: true }).click();
  await expect(studio.getByRole("alert")).toContainText("Penyimpanan belum selesai");
  expect(passages).toHaveLength(2);
  expect(deleted).toHaveLength(0);
  failCreate = false;
  await studio.getByRole("button", { name: "Simpan Reading", exact: true }).click();
  await expect(studio.getByRole("status")).toHaveText("Semua perubahan Reading tersimpan.");
  expect(passages).toHaveLength(2);
  expect(questions[1].reading_passage_id).toBe(102);
  await studio.getByRole("button", { name: "Simpan & Publish Reading", exact: true }).click();
  await expect(studio.getByRole("status")).toHaveText("Reading berhasil dipublikasikan.");
  expect(passages[1].status).toBe("published");
  expect(questions[1].status).toBe("published");
  await studio.getByRole("tab", { name: "Pratinjau Siswa", exact: true }).click();
  await expect(studio.getByRole("region", { name: "Pratinjau Siswa", exact: true })).toBeVisible();
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(studio.getByRole("button", { name: "Soal Berikutnya" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
});
