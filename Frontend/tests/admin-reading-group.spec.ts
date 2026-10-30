import { expect, test } from "./canonical-fixture";

test("Reading question builder adds reading group via toolbar and within question form", async ({ page }) => {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const passages: Array<{ id: number; chapter_id: number; title: string; body: string; status: string }> = [
      { id: 101, chapter_id: 1, title: "Bacaan Pembuka", body: "Ini adalah teks bacaan awal.", status: "published" },
    ];
    const questions: Array<{ id: number; reading_passage_id: number; question: string; options: Record<string, string>; correct_option: string; explanation: string; sort_order: number; status: string }> = [
      { id: 201, reading_passage_id: 101, question: "Apa topik bacaan?", options: { A: "A", B: "B", C: "C", D: "D" }, correct_option: "A", explanation: "", sort_order: 1, status: "published" },
    ];

    await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 1, program_id: 1, title: "Chapter 1", chapter_number: 1, status: "published" }] } }));
    await page.route("**/api/admin/reading-passages**", async route => {
      const req = route.request();
      if (req.method() === "POST") {
        const data = { ...req.postDataJSON(), id: 102 };
        passages.push(data);
        await route.fulfill({ status: 201, json: { data } });
        return;
      }
      await route.fulfill({ json: { data: passages } });
    });
    await page.route("**/api/admin/reading-questions**", async route => {
      const req = route.request();
      if (req.method() === "POST") {
        const data = { ...req.postDataJSON(), id: 200 + questions.length + 1 };
        questions.push(data);
        await route.fulfill({ status: 201, json: { data } });
        return;
      }
      await route.fulfill({ json: { data: questions } });
    });

    await page.goto("/admin/reading-question");
    await expect(page.getByRole("button", { name: "Tambah Grup Bacaan" }).first()).toBeVisible();

    // Test 1: Open from toolbar
    await page.locator(".admin-journey-actions").getByRole("button", { name: "Tambah Grup Bacaan", exact: true }).click();
    const groupDialog = page.getByRole("dialog", { name: "Grup Bacaan Reading", exact: true });
    await expect(groupDialog).toBeVisible();
    await groupDialog.getByLabel("Judul internal bacaan", { exact: true }).fill("Wawancara Pekerjaan");
    await groupDialog.getByRole("textbox", { name: "Teks bacaan grup", exact: true }).fill("面接の準備をします。");
    await groupDialog.getByLabel("Jumlah soal awal", { exact: true }).fill("2");
    await groupDialog.getByRole("button", { name: "Buat Grup", exact: true }).click();

    // Verifying group creation opened first generated question for editing
    await expect(groupDialog).toHaveCount(0);
    const questionDialog = page.getByRole("dialog", { name: "Edit Soal", exact: true });
    await expect(questionDialog).toBeVisible();
    await expect(questionDialog.getByRole("combobox", { name: "Teks bacaan", exact: true })).toHaveValue("102");
    await questionDialog.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(questionDialog).toHaveCount(0);

    // Test 2: Open from inside "Tambah Soal" form
    await page.getByRole("button", { name: "+ Tambah Soal", exact: true }).click();
    const addDialog = page.getByRole("dialog", { name: "Tambah Soal", exact: true });
    await expect(addDialog).toBeVisible();
    await addDialog.getByRole("button", { name: "Tambah Grup Bacaan", exact: true }).click();
    await expect(groupDialog).toBeVisible();
    await groupDialog.getByRole("button", { name: "Kembali", exact: true }).click();
    await expect(groupDialog).toHaveCount(0);
    await expect(addDialog).toBeVisible();
    await addDialog.getByRole("button", { name: "Batal", exact: true }).click();
  }
});
