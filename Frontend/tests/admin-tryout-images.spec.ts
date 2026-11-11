import { expect, test, type Page } from "./canonical-fixture";
import type { Locator } from "@playwright/test";
import type { AssessmentPassageBlock } from "../src/lib/assessment-image";

// In-memory API only. Save/reload assertions do not prove backend or database persistence.
const sessions = ["vocabulary_kanji", "grammar", "reading", "audio"];
const tabs = ["Kosakata & Kanji", "Tata Bahasa", "Reading (Dokkai)", "Audio (Choukai)"];
type Image = { image: string | null; image_alt: string; image_position: "before" | "after"; image_resolved_url?: string | null };
const emptyImage: Image = { image: null, image_alt: "", image_position: "before" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=", "base64");
const imageGroup = (page: Page, group = false) => page.getByRole("group", { name: group ? "Gambar Grup (Opsional)" : "Gambar Soal (Opsional)", exact: true });

async function mockStudio(page: Page, capabilities = true) {
  let saved = {
    id: 7, program_id: 1, title: "Mock image studio", studio_revision: "r1", max_score: 180, sort_order: 1,
    status: "draft", access_type: "membership", total_passing_score: null, session_passing_scores: null,
    ...(capabilities ? { builder_capabilities: { images: true, decimal_points: false } } : {}),
    passages: [
      { id: 50, title: "Reading group", body: "Bacaan gambar", ...emptyImage },
      { id: 51, title: "Grammar group", body: "Stimulus gambar", ...emptyImage },
    ],
    questions: sessions.map((session, index) => ({
      id: index + 1, session, passage_id: session === "grammar" ? 51 : session === "reading" ? 50 : null,
      question: `Pertanyaan gambar ${index + 1}`, options: { A: "Satu", B: "Dua", C: "Tiga", D: "Empat" },
      correct_option: "A", explanation: "", instruction: "", reading_passage: null, audio_url: null,
      point_value: 1, sort_order: index, status: "draft", ...emptyImage,
    })),
  };
  type Write = { revision: string; settings: Record<string, unknown>; passages: (Image & { id: string; title: string; body: string; blocks?: AssessmentPassageBlock[] })[]; questions: { id: string; content: Omit<typeof saved.questions[number], "id"> }[] };
  const writes: Write[] = [];
  const uploads: string[] = [];
  const mediaMethods: string[] = [];
  const assessmentMutations: string[] = [];
  await page.route("**/api/admin/media**", async route => {
    mediaMethods.push(route.request().method());
    expect(route.request().method()).toBe("POST");
    const path = `media/image/mock-${uploads.length + 1}.png`;
    uploads.push(path);
    await route.fulfill({ json: { data: { path, url: `https://images.example.test/${path}`, mime_type: "image/png" } } });
  });
  await page.route("https://images.example.test/**", route => route.fulfill({ contentType: "image/png", body: png }));
  await page.route("**/api/admin/try-outs**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") assessmentMutations.push(`${request.method()} ${path}`);
    if (request.method() === "PUT") {
      expect(path).toBe("/api/admin/try-outs/7/studio");
      const body = request.postDataJSON() as Write;
      expect(body.revision).toBe(saved.studio_revision);
      writes.push(body);
      saved = { ...saved, ...body.settings, studio_revision: `r${writes.length + 1}`,
        passages: body.passages.map(item => ({ ...item, id: Number(item.id), image_resolved_url: item.image ? `https://images.example.test/${item.image}` : null, ...(item.blocks == null ? {} : { blocks: item.blocks.map(block => block.type === "image" ? { ...block, image_resolved_url: `https://images.example.test/${block.image}` } : block) }) })),
        questions: body.questions.map(item => ({ ...item.content, id: Number(item.id), passage_id: item.content.passage_id == null ? null : Number(item.content.passage_id), image_resolved_url: item.content.image ? `https://images.example.test/${item.content.image}` : null })),
      };
      return route.fulfill({ json: { data: saved } });
    }
    expect(request.method()).toBe("GET");
    return route.fulfill({ json: { data: path === "/api/admin/try-outs" ? [saved] : saved } });
  });
  return { writes, uploads, mediaMethods, assessmentMutations, saved: () => saved };
}

async function openStudio(page: Page) {
  await page.goto("/admin/try-out");
  await page.getByRole("row").filter({ hasText: "Mock image studio" }).getByRole("button", { name: "Detail", exact: true }).click();
  await page.getByRole("button", { name: "Kelola Soal", exact: true }).click();
  await expect(imageGroup(page)).toBeVisible();
}
async function upload(group: Locator, alt: string, replace = false) {
  if (!replace) await group.getByRole("checkbox", { name: "Gunakan gambar", exact: true }).check();
  await group.getByLabel(replace ? "Ganti gambar" : "Upload gambar", { exact: true }).setInputFiles({ name: "diagram.png", mimeType: "image/png", buffer: png });
  await group.getByLabel("Teks alternatif gambar", { exact: true }).fill(alt);
  await expect(group.getByRole("img", { name: alt, exact: true })).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Simpan Try Out", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("berhasil disimpan");
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const editor = page.getByRole("region", { name: "Editor Konten", exact: true });
  expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
}

test("legacy capability absent disables image controls without upload and keeps text preview", async ({ page }) => {
  const api = await mockStudio(page, false);
  await openStudio(page);
  for (const tab of tabs) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    for (const group of await page.getByRole("group", { name: /^Gambar (Soal|Grup) \(Opsional\)$/ }).all()) {
      await expect(group.getByRole("checkbox", { name: "Gunakan gambar" })).toBeDisabled();
      await expect(group.getByRole("note")).toContainText("schema gambar Try Out belum diterapkan");
      await expect(group.locator('input[type="file"]')).toHaveCount(0);
    }
    await page.getByRole("tab", { name: "Pratinjau Siswa", exact: true }).click();
    const preview = page.getByRole("region", { name: "Pratinjau Siswa", exact: true });
    await expect(preview).toContainText("Pertanyaan gambar");
    await expect(preview.getByRole("img")).toHaveCount(0);
  }
  expect(api.uploads).toHaveLength(0);
});

test("mocked image upload and replace persist raw references and alt on all four tabs and both groups", async ({ page }) => {
  const api = await mockStudio(page);
  await openStudio(page);
  const references = new Map<number, string>();
  for (const [index, tab] of tabs.entries()) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await upload(imageGroup(page), `Question image ${index}`);
    await upload(imageGroup(page), `Replacement question ${index}`, true);
    references.set(index + 1, api.uploads.at(-1)!);
    if (index === 1 || index === 2) await upload(imageGroup(page, true), `Group image ${index}`);
  }
  await save(page);
  expect(api.writes).toHaveLength(1);
  for (const [index] of tabs.entries()) {
    const content = api.writes[0].questions.find(item => item.id === String(index + 1))!.content;
    expect(content).toMatchObject({ image: references.get(index + 1), image_alt: `Replacement question ${index}`, image_position: "before" });
    expect(content).not.toHaveProperty("image_resolved_url");
  }
  for (const [index, id] of [[1, "51"], [2, "50"]] as const) {
    const passage = api.writes[0].passages.find(item => item.id === id)!;
    expect(passage).toMatchObject({ image_alt: `Group image ${index}`, image_position: "before" });
    expect(passage.image).toMatch(/^media\/image\//);
    expect(passage).not.toHaveProperty("image_resolved_url");
  }
  await page.reload();
  await openStudio(page);
  for (const [index, tab] of tabs.entries()) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(imageGroup(page).getByLabel("Teks alternatif gambar", { exact: true })).toHaveValue(`Replacement question ${index}`);
    await expect(imageGroup(page).getByRole("img")).toHaveAttribute("src", `https://images.example.test/${references.get(index + 1)}`);
    if (index === 1 || index === 2) await expect(imageGroup(page, true).getByLabel("Teks alternatif gambar", { exact: true })).toHaveValue(`Group image ${index}`);
  }
});

test("question and group positions control actual preview DOM order and survive mocked save/reload", async ({ page }) => {
  const api = await mockStudio(page);
  await openStudio(page);
  for (const [tab, body] of [["Tata Bahasa", "Stimulus gambar"], ["Reading (Dokkai)", "Bacaan gambar"]]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await upload(imageGroup(page), `Question order ${tab}`);
    await upload(imageGroup(page, true), `Group order ${tab}`);
    for (const position of ["before", "after"] as const) {
      await imageGroup(page).getByRole("group", { name: "Posisi Gambar", exact: true }).getByRole("button", { name: position === "before" ? "Gambar → Pertanyaan" : "Pertanyaan → Gambar", exact: true }).click();
      await imageGroup(page, true).getByRole("group", { name: "Urutan Stimulus", exact: true }).getByRole("button", { name: position === "before" ? "Gambar → Teks" : "Teks → Gambar", exact: true }).click();
      await page.getByRole("tab", { name: "Pratinjau Siswa", exact: true }).click();
      const preview = page.getByRole("region", { name: "Pratinjau Siswa", exact: true });
      for (const [alt, text] of [[`Question order ${tab}`, `Pertanyaan gambar ${tab === "Tata Bahasa" ? 2 : 3}`], [`Group order ${tab}`, body]]) {
        const image = preview.getByRole("img", { name: alt, exact: true });
        await expect(image).toBeVisible();
        const textElement = preview.getByText(text, { exact: true });
        await expect(textElement).toBeVisible();
        const textHandle = await textElement.elementHandle();
        expect(await image.evaluate((element, target) => Boolean(element.compareDocumentPosition(target!) & Node.DOCUMENT_POSITION_FOLLOWING), textHandle)).toBe(position === "before");
      }
      await page.getByRole("tab", { name: "Editor", exact: true }).click();
    }
  }
  await save(page);
  for (const id of ["2", "3"]) expect(api.writes[0].questions.find(item => item.id === id)!.content.image_position).toBe("after");
  expect(api.writes[0].passages.map(item => item.image_position)).toEqual(["after", "after"]);
  await page.reload();
  await openStudio(page);
  for (const tab of ["Tata Bahasa", "Reading (Dokkai)"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(imageGroup(page).getByRole("button", { name: "Pertanyaan → Gambar", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(imageGroup(page, true).getByRole("button", { name: "Teks → Gambar", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("tab", { name: "Pratinjau Siswa", exact: true }).click();
    const preview = page.getByRole("region", { name: "Pratinjau Siswa", exact: true });
    await expect(preview.getByRole("img", { name: `Question order ${tab}`, exact: true })).toBeVisible();
    await expect(preview.getByRole("img", { name: `Group order ${tab}`, exact: true })).toBeVisible();
  }
});

for (const tab of ["Tata Bahasa", "Reading (Dokkai)"]) test(`ordered text-image-text passage saves, reloads and previews in ${tab} (mock API)`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const api = await mockStudio(page);
  await openStudio(page);
  await page.getByRole("tab", { name: tab, exact: true }).click();
  await page.getByRole("button", { name: "Susun teks dan gambar", exact: true }).click();
  const editor = page.getByRole("group", { name: "Susunan teks dan gambar bacaan", exact: true });
  await editor.getByRole("textbox", { name: "Teks bacaan 1", exact: true }).fill("Awal bacaan berurutan");
  await editor.getByRole("button", { name: "Tambah teks", exact: true }).click();
  await editor.getByRole("textbox", { name: "Teks bacaan 2", exact: true }).fill("Akhir bacaan berurutan");
  await editor.getByRole("button", { name: "Tambah gambar", exact: true }).click();
  await editor.getByLabel("Gambar bacaan 3", { exact: true }).setInputFiles({ name: "diagram.png", mimeType: "image/png", buffer: png });
  await editor.getByLabel("Teks alternatif gambar 3", { exact: true }).fill("Diagram tengah bacaan");
  await expect(editor.getByRole("img", { name: "Diagram tengah bacaan", exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Naikkan blok 3", exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "Teks bacaan 3", exact: true })).toHaveText("Akhir bacaan berurutan");
  await noOverflow(page);
  await save(page);
  const blocks = api.writes[0].passages.find(item => item.id === (tab === "Tata Bahasa" ? "51" : "50"))!.blocks!;
  expect(blocks.map(block => block.type)).toEqual(["text", "image", "text"]);
  expect(blocks[1]).toEqual({ type: "image", image: api.uploads[0], image_alt: "Diagram tengah bacaan" });
  expect(JSON.stringify(blocks)).not.toContain("image_resolved_url");
  await page.reload();
  await openStudio(page);
  await page.getByRole("tab", { name: tab, exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "Teks bacaan 1", exact: true })).toHaveText("Awal bacaan berurutan");
  await expect(editor.getByLabel("Teks alternatif gambar 2", { exact: true })).toHaveValue("Diagram tengah bacaan");
  await expect(editor.getByRole("textbox", { name: "Teks bacaan 3", exact: true })).toHaveText("Akhir bacaan berurutan");
  await page.getByRole("tab", { name: "Pratinjau Siswa", exact: true }).click();
  const preview = page.getByRole("region", { name: "Pratinjau Siswa", exact: true });
  const image = preview.getByRole("img", { name: "Diagram tengah bacaan", exact: true });
  await expect(image).toBeVisible();
  for (const [text, before] of [["Awal bacaan berurutan", true], ["Akhir bacaan berurutan", false]] as const) {
    const element = preview.getByText(text, { exact: true });
    await expect(element).toBeVisible();
    expect(await element.evaluate((node, other) => Boolean(node.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING), await image.elementHandle())).toBe(before);
  }
  await noOverflow(page);
});

test("Admin preview Runner preserves question and group image order outside builder", async ({ page }) => {
  const api = await mockStudio(page);
  const question = api.saved().questions.find(item => item.session === "reading")!;
  const passage = api.saved().passages.find(item => item.id === 50)!;
  Object.assign(question, { image: "media/image/runner-question.png", image_alt: "Runner question", image_position: "after", image_resolved_url: "https://images.example.test/media/image/runner-question.png" });
  Object.assign(passage, { image: "media/image/runner-group.png", image_alt: "Runner group", image_position: "before", image_resolved_url: "https://images.example.test/media/image/runner-group.png" });
  await page.goto("/admin/try-out");
  await page.getByRole("row").filter({ hasText: "Mock image studio" }).getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("region", { name: "Pratinjau Try Out", exact: true });
  await preview.getByRole("button", { name: "Runner", exact: true }).click();
  await preview.getByRole("button", { name: /Reading.* • 1 soal/ }).click();
  for (const [alt, text, before] of [["Runner question", "Pertanyaan gambar 3", false], ["Runner group", "Bacaan gambar", true]] as const) {
    const image = preview.getByRole("img", { name: alt, exact: true });
    await expect(image).toBeVisible();
    const textElement = preview.getByText(text, { exact: true });
    await expect(textElement).toBeVisible();
    expect(await image.evaluate((element, target) => Boolean(element.compareDocumentPosition(target!) & Node.DOCUMENT_POSITION_FOLLOWING), await textElement.elementHandle())).toBe(before);
  }
  expect(api.writes).toHaveLength(0);
  expect(api.uploads).toHaveLength(0);
});

test("toggle and clear remove references only, never delete uploaded media", async ({ page }) => {
  const api = await mockStudio(page);
  await openStudio(page);
  await page.getByRole("tab", { name: "Reading (Dokkai)", exact: true }).click();
  for (const group of [imageGroup(page), imageGroup(page, true)]) {
    await upload(group, "Clear image");
    await group.getByRole("button", { name: "Hapus referensi gambar", exact: true }).click();
    await expect(group.getByRole("checkbox", { name: "Gunakan gambar" })).not.toBeChecked();
    await expect(group.getByRole("img")).toHaveCount(0);
    await upload(group, "Toggle image");
    await group.getByRole("checkbox", { name: "Gunakan gambar" }).uncheck();
    await expect(group.getByRole("img")).toHaveCount(0);
  }
  await save(page);
  expect(api.writes[0].questions.find(item => item.id === "3")!.content.image).toBeNull();
  expect(api.writes[0].passages.find(item => item.id === "50")!.image).toBeNull();
  expect(api.mediaMethods).toEqual(["POST", "POST", "POST", "POST"]);
  await openStudio(page);
  await page.getByRole("tab", { name: "Reading (Dokkai)", exact: true }).click();
  for (const group of [imageGroup(page), imageGroup(page, true)]) await expect(group.getByRole("checkbox", { name: "Gunakan gambar" })).not.toBeChecked();
});

test("unsupported image MIME rejects before upload and keeps question text", async ({ page }) => {
  const api = await mockStudio(page);
  await openStudio(page);
  const group = imageGroup(page);
  await group.getByRole("checkbox", { name: "Gunakan gambar" }).check();
  await group.getByLabel("Upload gambar", { exact: true }).setInputFiles({ name: "diagram.png", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(group.getByRole("alert")).toContainText("Format gambar tidak didukung");
  await expect(page.getByRole("textbox", { name: "Pertanyaan", exact: true })).toHaveText("Pertanyaan gambar 1");
  expect(api.uploads).toHaveLength(0);
});

test("pending upload blocks save, close and session navigation until response", async ({ page }) => {
  const api = await mockStudio(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/media", async route => {
    await pending;
    await route.fulfill({ json: { data: { path: "media/image/pending.png", url: "https://images.example.test/media/image/pending.png", mime_type: "image/png" } } });
  });
  await openStudio(page);
  const group = imageGroup(page);
  await group.getByRole("checkbox", { name: "Gunakan gambar" }).check();
  await group.getByLabel("Upload gambar", { exact: true }).setInputFiles({ name: "diagram.png", mimeType: "image/png", buffer: png });
  try {
    await expect(page.getByRole("button", { name: "Menyimpan...", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Kembali ke Daftar", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Publish Semua Soal", exact: true })).toBeDisabled();
    const url = page.url();
    await page.getByRole("link", { name: "Checkpoint", exact: true }).click();
    const guard = page.getByRole("dialog", { name: "Perubahan belum disimpan", exact: true });
    await expect(guard).toBeVisible();
    await expect(guard.getByRole("button", { name: "Keluar Tanpa Menyimpan", exact: true })).toBeDisabled();
    await expect(page).toHaveURL(url);
    await guard.getByRole("button", { name: "Tetap Mengedit", exact: true }).click();
    await expect(guard).not.toBeVisible();
    await expect(page.getByRole("region", { name: "HIRU TRY OUT STUDIO", exact: true })).toBeVisible();
    expect(api.assessmentMutations).toEqual([]);
    await page.getByRole("tab", { name: "Reading (Dokkai)", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Kosakata & Kanji", exact: true })).toHaveAttribute("aria-selected", "true");
    expect(api.writes).toHaveLength(0);
  } finally { release(); }
  await expect(group.getByLabel("Teks alternatif gambar", { exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Simpan Try Out", exact: true })).toBeEnabled();
});

for (const width of [1440, 768, 390]) test(`image question and group editors fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await mockStudio(page);
  await openStudio(page);
  for (const tab of tabs) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await upload(imageGroup(page), `Responsive question ${tab}`);
    if (tab === "Tata Bahasa" || tab === "Reading (Dokkai)") await upload(imageGroup(page, true), `Responsive group ${tab}`);
    await noOverflow(page);
    await page.getByRole("tab", { name: "Pratinjau Siswa", exact: true }).click();
    await noOverflow(page);
  }
});
