import { expect, test } from "@playwright/test";

for (const width of [360, 1440]) {
  test(`placement question keeps readable size and admin formatting at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const richText = 'Normal <strong>Bold</strong> <em>Italic</em> <u>Underline</u> <ruby>日本語<rt>にほんご</rt></ruby>';
    await page.route("**/api/me", route => route.fulfill({ status: 401, json: {} }));
    await page.route("**/api/placement/attempts/12**", route => route.fulfill({ json: { data: {
      id: 12, status: "in_progress", answers: {}, result: null,
      expires_at: new Date(Date.now() + 240000).toISOString(),
      questions: [{ id: 41, category: "Dokkai", prompt: richText, reading_passage: richText,
        options: { A: richText, B: "Second", C: "Third", D: "Fourth" } }],
    } } }));
    await page.goto("/placement/question?attempt=12");
    const prompt = page.locator(".placement-question-prompt");
    await expect(prompt).toContainText("Normal");
    await expect(prompt).toHaveCSS("font-size", "18px");
    await expect(prompt).toHaveCSS("font-weight", "400");
    await expect(prompt).toHaveCSS("max-height", "none");
    await expect(prompt).toHaveCSS("overflow-y", "visible");
    for (const content of [prompt, page.locator(".placement-reading-passage"), page.locator(".placement-option").first()]) {
      await expect(content.locator("strong")).toHaveCSS("font-weight", "700");
      await expect(content.locator("em")).toHaveCSS("font-style", "italic");
      await expect(content.locator("u")).toHaveCSS("text-decoration-line", "underline");
      await expect(content.locator("ruby rt")).toHaveText("にほんご");
      await expect(content.locator("ruby")).toHaveCSS("ruby-position", "over");
    }
  });
}
