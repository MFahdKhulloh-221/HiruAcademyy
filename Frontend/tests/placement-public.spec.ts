import { expect, test } from "@playwright/test";
import path from "node:path";
import { testimonialVideo } from "../src/lib/public-content-api";

test("safe public video sources", () => {
  expect(testimonialVideo("javascript:alert(1)")).toBeNull();
  expect(testimonialVideo("https://user:pass@example.test/video.mp4")).toBeNull();
  expect(testimonialVideo("https://youtu.be/abcdefghijk")).toEqual({ kind: "youtube", src: "https://www.youtube-nocookie.com/embed/abcdefghijk", href: "https://www.youtube.com/watch?v=abcdefghijk" });
  expect(testimonialVideo("https://www.youtube.com/watch?v=abcdefghijk")).toEqual({ kind: "youtube", src: "https://www.youtube-nocookie.com/embed/abcdefghijk", href: "https://www.youtube.com/watch?v=abcdefghijk" });
  expect(testimonialVideo("media/video/id.mp4", "https://cdn.example.test/signed.mp4?signature=test")).toEqual({ kind: "native", src: "https://cdn.example.test/signed.mp4?signature=test", href: "https://cdn.example.test/signed.mp4?signature=test" });
});

for (const width of [360, 768, 1440]) {
  test(`persisted Placement presentation ${width}`, async ({ page, baseURL }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await page.context().addCookies([{ name: "XSRF-TOKEN", value: "fixture", url: baseURL! }]);
    const attempt = { id: 12, status: "in_progress", questions: [{ id: 41, category: "Bunpou", prompt: "Persisted question", options: { A: "First", B: "Second", C: "Third", D: "Fourth" } }], answers: {} as Record<string, string>, result: null as object | null, expires_at: new Date(Date.now() + 240000).toISOString() };
    await page.route("**/api/me", route => route.fulfill({ status: 401, json: {} }));
    await page.route("**/sanctum/csrf-cookie", route => route.fulfill({ status: 204 }));
    await page.route("**/api/placement/attempts/12**", async route => {
      const request = route.request();
      if (request.method() === "PUT") attempt.answers = request.postDataJSON().answers;
      if (request.url().endsWith("/submit")) {
        attempt.status = "completed";
        attempt.result = { correct: 1, wrong: 0, unanswered: 0, percentage: 100, recommendation_level: "N2", areas: ["Bunpou", "Moji・Goi", "Dokkai", "Choukai"].map(name => ({ name, score: name === "Bunpou" ? 100 : 0, total: name === "Bunpou" ? 1 : 0 })) };
      }
      await route.fulfill({ json: { data: attempt } });
    });
    await page.route("**/api/public/offers", route => route.fulfill({ json: { data: ["sensei", "lms", "free"].map(plan_code => ({ plan_code, program: { code: "n2", name: "JLPT N2", slug: "n2" }, effective_price: plan_code === "free" ? 0 : 123456, base_price: 123456, currency: "IDR", duration_months: 1, discount_percent: 0 })) } }));
    await page.goto("/placement/question?attempt=12");
    await expect(page.getByRole("heading", { name: "Persisted question" })).toBeVisible();
    await page.getByRole("radio").nth(1).check();
    await expect(page.getByRole("button", { name: "Selesaikan Test" })).toBeEnabled();
    await page.reload();
    await expect(page.getByRole("radio").nth(1)).toBeChecked();
    await page.getByRole("button", { name: "Selesaikan Test" }).click();
    await expect(page).toHaveURL(/placement\/result\?attempt=12/, { timeout: 20000 });
    const analysis = page.locator(".placement-analysis");
    await expect(analysis.getByRole("heading", { name: "Ringkasan Hasil per Kategori" })).toBeVisible();
    await expect(analysis.locator("article")).toHaveCount(4);
    await expect(analysis.getByRole("progressbar", { name: "Skor Bunpou" })).toHaveAttribute("value", "100");
    await expect(page.getByRole("heading", { name: "Rekomendasi Level yang disarankan adalah N2" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("public canonical resolved photos and YouTube/native testimonials", async ({ page }) => {
  await page.route("**/api/me", route => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/sensei-profiles", route => route.fulfill({ json: { data: [{ id: 1, name: "Canonical Sensei", role: "Sensei", bio: "", photo: "media/image/id.webp", photo_resolved_url: "https://cdn.example.test/sensei.webp", expertise: ["N2"], level: "n2" }] } }));
  await page.goto("/sensei");
  await expect(page.getByAltText("Foto profil Canonical Sensei")).toHaveAttribute("src", "https://cdn.example.test/sensei.webp");
  await page.route("**/api/testimonials", route => route.fulfill({ json: { data: [
    { id: 1, name: "Canonical Video", context: "Sensei", quote: "Published quote", image: "media/image/id.webp", image_resolved_url: "https://cdn.example.test/photo.webp", video_url: "https://youtu.be/abcdefghijk", video_title: "Approved video" },
    { id: 2, name: "Native Video", context: "Mandiri", quote: "Published native", image: null, video_url: "media/video/id.mp4", video_url_resolved_url: "https://cdn.example.test/native.mp4", video_title: "Native title" },
    { id: 3, type: "text", name: "Canonical Student", context: "Mandiri", quote: "Published text", image: "media/image/student.webp", image_resolved_url: "https://cdn.example.test/photo.webp" },
  ] } }));
  await page.route("https://cdn.example.test/photo.webp", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="104" height="104"><rect width="104" height="104" fill="gray"/></svg>' }));
  await page.goto("/testimoni");
  await page.route("https://www.youtube-nocookie.com/embed/**", route => route.fulfill({ contentType: "text/html", body: "Video fixture" }));
  await page.route("https://cdn.example.test/native.mp4", route => route.fulfill({ contentType: "video/mp4", path: path.join(__dirname, "fixtures/playable.mp4") }));
  await expect(page.getByAltText("Foto profil Canonical Student")).toHaveAttribute("src", "https://cdn.example.test/photo.webp");
  await expect(page.getByTitle("Approved video")).toHaveCount(0);
  await page.getByRole("button", { name: "Tonton Approved video", exact: true }).click();
  const youtube = page.getByRole("dialog", { name: "Approved video", exact: true });
  await youtube.getByRole("button", { name: "Putar Approved video", exact: true }).click();
  await expect(youtube.getByTitle("Approved video")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abcdefghijk");
  await expect(youtube.getByRole("link", { name: "Buka video" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=abcdefghijk");
  await youtube.getByRole("button", { name: "Tutup video" }).click();
  await expect(page.getByRole("button", { name: "Tonton Approved video", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Tonton Native title", exact: true }).click();
  const native = page.getByRole("dialog", { name: "Native title", exact: true });
  await native.getByRole("button", { name: "Putar Native title", exact: true }).click();
  await expect(native.getByLabel("Native title")).toHaveAttribute("src", "https://cdn.example.test/native.mp4");
  await expect(native.getByRole("link", { name: "Buka video" })).toHaveAttribute("href", "https://cdn.example.test/native.mp4");
});
