import { expect, test, type Page } from "./canonical-fixture";

// In-memory API only; no backend scoring or database writes.
async function mockPreview(page: Page, configured = true, checkpoint = false) {
  const endpoint = checkpoint ? "checkpoint-packages" : "try-outs";
  const image = (name: string, position: string) => ({ image: `media/${name}.png`, image_alt: name, image_position: position, image_resolved_url: `https://images.example.test/${encodeURIComponent(name)}.png` });
  const saved = {
    id: 7, program_id: 1, title: "Preview content", max_score: 80, sort_order: 1, status: "draft",
    total_passing_score: configured ? 42 : null,
    session_passing_scores: configured ? { vocabulary_kanji: 3, grammar: 5, reading: 7, audio: 9 } : null,
    builder_capabilities: { images: true, decimal_points: false },
    passages: [{ id: 51, title: "Grammar group", body: "Stimulus bersama", ...image("Gambar stimulus", "after") }],
    questions: ["vocabulary_kanji", "grammar", "reading", "audio"].map((session, index) => ({
      id: index + 1, session, passage_id: session === "grammar" ? 51 : null,
      question: `Pertanyaan ${index + 1}`, options: { A: "Satu", B: "Dua", C: "Tiga", D: "Empat" },
      correct_option: "A", explanation: "Penjelasan", reading_passage: session === "reading" ? "Bacaan mandiri" : null,
      audio_url: session === "audio" ? "https://audio.example.test/question.mp3" : null,
      point_value: 20, sort_order: index, status: "draft", ...image(`Gambar soal ${index + 1}`, "before"),
    })),
  };
  await page.route("https://images.example.test/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>' }));
  await page.route(`**/api/admin/${endpoint}**`, route => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith(`/${endpoint}`) ? [saved] : saved } });
  });
  await page.goto(checkpoint ? "/admin/checkpoint" : "/admin/try-out");
  await page.getByRole("row").filter({ hasText: "Preview content" }).getByRole("button", { name: "Preview", exact: true }).click();
  return page.getByRole("region", { name: checkpoint ? "Pratinjau Checkpoint" : "Pratinjau Try Out", exact: true });
}

test("Try Out preview shows configured limits without simulated verdict and preserves content DOM", async ({ page }) => {
  const preview = await mockPreview(page);
  await expect(preview.getByRole("heading", { name: "Pratinjau Tampilan Soal" })).toBeVisible();
  await expect(preview.getByText("80 Poin", { exact: true })).toBeVisible();
  await expect(preview.getByText("180 Poin", { exact: true })).toHaveCount(0);
  await expect(preview.getByText("42", { exact: true })).toBeVisible();
  await expect(preview.getByText("Tata Bahasa: Passing score: 5 poin", { exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Hasil", exact: true })).toHaveCount(0);
  await preview.getByRole("button", { name: "Runner", exact: true }).click();
  await preview.getByRole("radio").first().check();
  await expect(preview.getByRole("radio").first()).toBeChecked();
  await expect(preview.getByRole("button", { name: "Hasil contoh", exact: true })).toHaveCount(0);
  await expect(preview.getByText(/^(TIDAK )?LULUS$/)).toHaveCount(0);
  const image = preview.getByRole("img", { name: "Gambar soal 1", exact: true });
  await expect(image).toBeVisible();
  expect(await image.evaluate(element => Boolean(element.compareDocumentPosition(element.closest("section")!.querySelector("h2")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await preview.getByRole("button", { name: "Tata Bahasa • 1 soal", exact: true }).click();
  await expect(preview.getByText("Stimulus bersama", { exact: true })).toBeVisible();
  const stimulusImage = preview.getByRole("img", { name: "Gambar stimulus", exact: true });
  await expect(stimulusImage).toBeVisible();
  expect(await stimulusImage.evaluate(element => Boolean(element.compareDocumentPosition(element.closest("section")!.querySelector('[lang="ja"]')!) & Node.DOCUMENT_POSITION_PRECEDING))).toBe(true);
  await preview.getByRole("button", { name: "Reading / Dokkai • 1 soal", exact: true }).click();
  await expect(preview.getByText("Bacaan mandiri", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Audio / Choukai • 1 soal", exact: true }).click();
  await expect(preview.locator("audio")).toHaveAttribute("src", "https://audio.example.test/question.mp3");
});

test("Try Out null thresholds show server fallback without inventing total threshold", async ({ page }) => {
  const preview = await mockPreview(page, false);
  await expect(preview.getByText("Tidak ditetapkan", { exact: true })).toBeVisible();
  await expect(preview.getByText(/Fallback server: minimal 19 jawaban benar/)).toHaveCount(4);
  await expect(preview.getByRole("button", { name: "Hasil", exact: true })).toHaveCount(0);
});

test("Checkpoint retains local result controls", async ({ page }) => {
  const preview = await mockPreview(page, true, true);
  await expect(preview.getByRole("heading", { name: "Pratinjau Tampilan Soal" })).toHaveCount(0);
  await preview.getByRole("button", { name: "Runner", exact: true }).click();
  await preview.getByRole("radio").first().check();
  await preview.getByRole("button", { name: "Hasil contoh", exact: true }).click();
  await expect(preview.getByRole("heading", { name: "Hasil Checkpoint", exact: true })).toBeVisible();
  await expect(preview.getByRole("status")).toHaveText("TIDAK LULUS");
});
