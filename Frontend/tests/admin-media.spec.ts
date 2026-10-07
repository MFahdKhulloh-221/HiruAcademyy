import { expect, test } from "./canonical-fixture";
import { validMediaFile, validVideoReference, videoEmbed } from "../src/lib/admin-media";

test("Admin supported media formats and video sources", () => {
  expect(validMediaFile(new File(["image"], "photo.webp", { type: "image/webp" }), "image")).toBe(true);
  expect(validMediaFile(new File(["image"], "photo.gif", { type: "image/gif" }), "image")).toBe(false);
  expect(validMediaFile(new File([], "audio.mp3", { type: "audio/mpeg" }), "audio")).toBe(false);
  expect(validMediaFile(new File(["audio"], "audio.ogg", { type: "audio/ogg" }), "audio")).toBe(true);
  for (const source of ["https://www.youtube.com/watch?v=abcdefghijk", "https://www.youtube.com/embed/abcdefghijk", "https://www.youtube.com/shorts/abcdefghijk", "https://youtu.be/abcdefghijk", "https://example.test/video.mp4", "media/video/abcdef.webm", ""]) expect(validVideoReference(source)).toBe(true);
  for (const source of ["javascript:alert(1)", "https://user:pass@example.test/video.mp4", "https://example.test/video.mov", "https://youtube.com.evil.test/watch?v=abcdefghijk"]) expect(validVideoReference(source)).toBe(false);
  expect(videoEmbed("https://www.youtube.com/shorts/abcdefghijk")).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
});

test("Admin testimonial uploads canonical paths, previews video and preserves media on edit", async ({ page }) => {
  test.setTimeout(60000);
  await page.route("**/storage/media/image/**", route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64") }));
  const rows: Record<string, unknown>[] = [];
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/admin/media", async route => {
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data; boundary=");
    expect(route.request().headers()["x-xsrf-token"]).toBeTruthy();
    const body = route.request().postData() ?? "";
    const kind = body.includes("video") ? "video" : "image";
    const path = `media/${kind}/12345678-1234-1234-1234-123456789012.${kind === "video" ? "mp4" : "png"}`;
    await route.fulfill({ status: 201, json: { data: { path, url: `http://localhost:8000/storage/${path}`, mime_type: kind === "video" ? "video/mp4" : "image/png" } } });
  });
  await page.route("**/api/admin/testimonials**", async route => {
    if (["POST", "PATCH"].includes(route.request().method())) {
      const row = { ...route.request().postDataJSON(), id: 1 };
      writes.push(row); rows.splice(0, rows.length, row);
      await route.fulfill({ status: 201, json: { data: row } });
    } else await route.fulfill({ json: { data: rows } });
  });
  await page.goto("/admin/testimoni");
  await page.getByRole("button", { name: "Tambah Testimoni", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama", { exact: true }).fill("Media QA");
  await dialog.getByLabel("Konteks", { exact: true }).fill("N5");
  await dialog.getByLabel("Kutipan", { exact: true }).fill("Testimoni QA");
  await dialog.getByLabel("Upload image").setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: Buffer.from("image") });
  await expect(dialog.getByLabel("Upload image")).toBeEnabled();
  await dialog.getByLabel("Upload video").setInputFiles({ name: "video.mp4", mimeType: "video/mp4", buffer: Buffer.from("video") });
  await expect(dialog.getByLabel("Upload video")).toBeEnabled();
  await dialog.getByLabel("Judul video").fill("Video QA");
  await expect(dialog.locator("video")).toHaveAttribute("src", /\/storage\/media\/video\//);
  await dialog.getByRole("button", { name: "Simpan Testimoni", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0].image).toMatch(/^media\/image\//);
  expect(writes[0].video_url).toMatch(/^media\/video\//);
  expect(Object.keys(writes[0]).some(key => key.endsWith("_resolved_url"))).toBe(false);
  await page.getByRole("button", { name: "Edit testimoni Media QA", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit Testimoni", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Simpan Testimoni", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[1].image).toBe(writes[0].image);
  expect(writes[1].video_url).toBe(writes[0].video_url);
});

test("Admin chapter video edits existing record and deletes through API", async ({ page }) => {
  let rows = [{ id: 81, chapter_id: 32, title: "Chapter video QA", description: "", video_url: "https://example.test/video.mp4", sort_order: 1, status: "draft" }];
  let deleted = false;
  await page.route("**/api/admin/programs", route => route.fulfill({ json: { data: [{ id: 17, code: "n5", name: "JLPT N5", family: "jlpt" }] } }));
  await page.route("**/api/admin/chapters", route => route.fulfill({ json: { data: [{ id: 32, program_id: 17, title: "Salam dan Perkenalan", chapter_number: 1, status: "draft" }] } }));
  await page.route("**/api/admin/video-lessons**", async route => {
    if (route.request().method() === "DELETE") { expect(route.request().url()).toMatch(/\/81$/); deleted = true; rows = []; await route.fulfill({ status: 204 }); }
    else await route.fulfill({ json: { data: rows } });
  });
  await page.goto("/admin/video-lesson");
  await page.getByRole("button", { name: "Tambah Video", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /^Program/ }).selectOption("17");
  await dialog.getByRole("combobox", { name: /^Chapter/ }).selectOption("32");
  await expect(dialog.getByRole("heading", { name: "Edit Video", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Judul", { exact: true })).toHaveValue("Chapter video QA");
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("button", { name: "Hapus Chapter video QA", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Hapus Video", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Belum ada data", exact: true })).toBeVisible();
  expect(deleted).toBe(true);
});
