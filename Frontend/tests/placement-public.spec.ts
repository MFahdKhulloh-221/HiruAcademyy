import { expect, test } from "@playwright/test";
import { testimonialVideo } from "../src/lib/public-content-api";

test("safe public video sources", () => {
  expect(testimonialVideo("javascript:alert(1)")).toBeNull();
  expect(testimonialVideo("https://user:pass@example.test/video.mp4")).toBeNull();
  expect(testimonialVideo("https://youtu.be/abcdefghijk")).toEqual({ kind: "youtube", src: "https://www.youtube-nocookie.com/embed/abcdefghijk" });
  expect(testimonialVideo("https://www.youtube.com/watch?v=abcdefghijk")).toEqual({ kind: "youtube", src: "https://www.youtube-nocookie.com/embed/abcdefghijk" });
  expect(testimonialVideo("media/video/id.mp4", "https://cdn.example.test/signed.mp4?signature=test")).toEqual({ kind: "native", src: "https://cdn.example.test/signed.mp4?signature=test" });
});

for (const width of [360, 768, 1440]) {
  test(`persisted Placement presentation ${width}`, async ({ page, baseURL }) => {
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
    await expect(page).toHaveURL(/placement\/result\?attempt=12/);
    await expect(page.getByRole("heading", { name: "Analisis kemampuan" })).toBeVisible();
    await expect(page.locator(".placement-score-grid article")).toHaveCount(4);
    await expect(page.locator(".placement-score-grid article").first()).toContainText("100 / 100");
    await expect(page.locator(".program-price").first()).toContainText("123.456");
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
  ] } }));
  await page.goto("/testimoni");
  await expect(page.getByTitle("Approved video")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abcdefghijk");
  await expect(page.getByLabel("Native title")).toHaveAttribute("src", "https://cdn.example.test/native.mp4");
  await expect(page.getByAltText("Foto Canonical Video")).toHaveAttribute("src", "https://cdn.example.test/photo.webp");
});
