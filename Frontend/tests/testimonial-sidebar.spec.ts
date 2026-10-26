import { expect, test } from "@playwright/test";

test("testimonial explorer local API, filters, dialog and responsive", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (/hydration|hydrating/i.test(message.text())) errors.push(message.text()); });
  let reads = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/testimonials") reads++; });
  const response = await request.get("http://localhost:8000/api/testimonials");
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  const texts = data.filter((item: { type: string }) => item.type === "text");
  const videos = data.filter((item: { type: string }) => item.type === "video");
  await page.goto("/testimoni", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".testimonial-card")).toHaveCount(texts.length);
  expect(texts.length).toBe(29);
  expect(videos.length).toBe(2);
  for (const item of texts) {
    expect(Number.isFinite(Date.parse(item.created_at))).toBe(true);
  }
  await expect(page.locator(".testimonial-card time")).toHaveCount(texts.length);
  await expect(page.locator(".testimonial-card time").first()).toHaveText(new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(texts[0].created_at)));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole("heading", { name: "Cerita Siswa Hiru Academy", exact: true })).toBeVisible();
    const geometry = await page.evaluate(() => {
      const text = document.querySelector('[aria-label="Testimoni siswa"]')!.getBoundingClientRect();
      const video = document.querySelector("aside")!.getBoundingClientRect();
      const card = document.querySelector(".testimonial-card")!;
      return { text: { top: text.top, right: text.right }, video: { top: video.top, left: video.left, bottom: video.bottom }, columns: getComputedStyle(document.querySelector(".testimonial-grid")!).gridTemplateColumns.split(" ").length, minHeight: getComputedStyle(card).minHeight };
    });
    if (width >= 1100) expect(geometry.video.left).toBeGreaterThan(geometry.text.right);
    else expect(geometry.video.bottom).toBeLessThanOrEqual(geometry.text.top);
    expect(geometry.columns).toBe(1);
    expect(geometry.minHeight).toBe("0px");
    const sizes = await page.locator('.testimonial-card[data-expanded="false"]').evaluateAll(cards => cards.map(card => {
      const box = card.getBoundingClientRect();
      const quote = card.querySelector("blockquote")!.getBoundingClientRect();
      return { height: box.height, width: box.width, quoteTop: quote.top - box.top };
    }));
    expect(sizes.every(size => size.height >= 64 && size.height < 400)).toBe(true);
    expect(Math.max(...sizes.map(size => size.width)) - Math.min(...sizes.map(size => size.width))).toBeLessThan(1);
    expect(sizes.every(size => size.quoteTop >= 84)).toBe(true);
    if (width >= 1100) {
      const ratio = await page.evaluate(() => document.querySelector('[aria-label="Testimoni siswa"]')!.getBoundingClientRect().width / document.querySelector("aside")!.getBoundingClientRect().width);
      expect(ratio).toBeCloseTo(3, 1);
    }
    const textList = page.getByRole("region", { name: "Daftar testimoni teks" });
    await expect.poll(() => textList.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await textList.evaluate(element => {
      const top = (element.firstElementChild as HTMLElement).offsetTop;
      return new Set(Array.from(element.children).filter(child => (child as HTMLElement).offsetTop - top < element.clientHeight - 8).map(child => (child as HTMLElement).offsetTop)).size;
    })).toBe(7);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `C:/Users/Tulo/AppData/Local/Temp/opencode/explorer-${width}.png`, fullPage: false });
  }
  const beforeFilters = reads;
  const group = page.getByRole("group", { name: "Jenis testimoni" });
  await group.getByRole("button", { name: "Terbaru", exact: true }).click();
  await expect(group.getByRole("button", { name: "Terbaru", exact: true })).toHaveAttribute("aria-pressed", "true");
  const latest = [...texts].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  await expect(page.locator(".testimonial-card header strong")).toHaveText(latest.map(item => item.name));
  await expect(page.getByLabel("Urutan", { exact: true })).toHaveValue("latest");
  await group.getByRole("button", { name: "Semua", exact: true }).click();
  await group.getByRole("button", { name: "Testimoni", exact: true }).click();
  await expect(page.locator("aside")).toHaveCount(0);
  await expect(page.locator(".testimonial-card")).toHaveCount(29);
  await page.getByLabel("Urutan", { exact: true }).selectOption("name");
  const sorted = texts.map((item: { name: string }) => item.name).sort((a: string, b: string) => a.localeCompare(b, "id"));
  await expect(page.locator(".testimonial-card header strong")).toHaveText(sorted);
  await page.getByLabel("Urutan", { exact: true }).selectOption("default");
  await expect(page.locator(".testimonial-card header strong")).toHaveText(texts.map((item: { name: string }) => item.name));
  const id = await page.locator(".testimonial-card").filter({ has: page.getByRole("button", { name: "Baca selengkapnya" }) }).first().getAttribute("id");
  const longCard = page.locator(`#${id}`);
  const collapsedHeight = (await longCard.boundingBox())!.height;
  const otherHeights = await page.locator('.testimonial-card[data-expanded="false"]').evaluateAll(cards => cards.map(card => ({ id: card.id, height: card.getBoundingClientRect().height })));
  await longCard.getByRole("button", { name: "Baca selengkapnya" }).click();
  await expect(longCard.getByRole("button", { name: "Tampilkan lebih sedikit" })).toHaveAttribute("aria-expanded", "true");
  expect((await longCard.boundingBox())!.height).toBeGreaterThan(collapsedHeight);
  const unchanged = await page.locator('.testimonial-card[data-expanded="false"]').evaluateAll(cards => cards.map(card => ({ id: card.id, height: card.getBoundingClientRect().height })));
  expect(unchanged).toEqual(otherHeights.filter(card => card.id !== id));
  await expect.poll(() => longCard.locator("blockquote").evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await longCard.getByRole("button", { name: "Tampilkan lebih sedikit" }).click();
  await expect.poll(async () => (await longCard.boundingBox())!.height).toBe(collapsedHeight);
  await group.getByRole("button", { name: "Video Testimoni", exact: true }).click();
  await expect(page.locator(".testimonial-card")).toHaveCount(0);
  const triggers = page.getByRole("button", { name: /^Tonton / });
  await expect(triggers).toHaveCount(2);
  for (const trigger of await triggers.all()) {
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Tutup video" })).toBeFocused();
    await expect(dialog).toContainText(/demo/i);
    await dialog.getByRole("button", { name: /^Putar / }).click();
    await expect.poll(() => dialog.locator("video").evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.locator("video")).toHaveCount(0);
  }
  expect(reads).toBe(beforeFilters);
  await page.evaluate(hash => { window.location.hash = hash!; }, id);
  await expect(longCard.getByRole("button", { name: "Tampilkan lebih sedikit" })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(longCard.getByRole("button", { name: "Tampilkan lebih sedikit" })).toBeVisible();
  await page.route("**/api/testimonials", route => route.fulfill({ json: { data: texts } }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".testimonial-card")).toHaveCount(29);
  await group.getByRole("button", { name: "Video Testimoni", exact: true }).click();
  await expect(page.getByText("Belum ada video testimoni yang dipublikasikan.")).toBeVisible();
  expect(errors).toEqual([]);
});
