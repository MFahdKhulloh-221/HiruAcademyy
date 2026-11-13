import { expect, test } from "./canonical-fixture";

test("Audio has one add action and student-style interactive preview", async ({ page }) => {
  await page.route("**/api/admin/audio-questions", route => route.fulfill({ json: { data: [{ id: 1, chapter_id: 1, question: "Apa aktivitas pembicara?", audio_url: "", options: { A: "Belajar", B: "Tidur", C: "Makan", D: "Bekerja" }, correct_option: "A", explanation: "Pembahasan khusus admin", status: "published", sort_order: 1 }] } }));
  await page.goto("/admin/audio-question");
  await expect(page.getByRole("button", { name: /Tambah Soal/ })).toHaveCount(1);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Preview Soal" });
  await expect(dialog.locator(".learning-question-card")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Apa aktivitas pembicara?" })).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(4);
  await dialog.getByRole("radio", { name: "B. Tidur" }).check();
  await expect(dialog.getByRole("radio", { name: "B. Tidur" })).toBeChecked();
  await expect(dialog.locator("label.selected")).toContainText("Tidur");
  await expect(dialog).not.toContainText("Jawaban benar:");
  await expect(dialog).not.toContainText("Pembahasan khusus admin");
});
