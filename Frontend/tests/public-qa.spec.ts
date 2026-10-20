import { expect, test } from "@playwright/test";

test("testimonial counters finish once with Indonesian formatting", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const counter = document.querySelector<HTMLElement>('[data-counter="2300"]');
      if (!counter) return;
      new MutationObserver(() => {
        const value = Number(counter.textContent?.replace(/\D/g, ""));
        if (value > 0 && value < 2300) counter.dataset.observedIntermediate = "true";
      }).observe(counter, { childList: true, characterData: true, subtree: true });
    });
  });
  await page.goto("/testimoni");
  const counters = page.locator(".testimonial-kpis [data-counter]");
  await page.locator(".testimonial-kpis").scrollIntoViewIfNeeded();
  await expect(counters.first()).toHaveAttribute("data-observed-intermediate", "true");
  await expect(counters).toHaveText(["2.300+", "92%", "4,9 / 5"]);
  await page.locator(".public-footer").scrollIntoViewIfNeeded();
  await page.locator(".testimonial-kpis").scrollIntoViewIfNeeded();
  await expect(counters).toHaveText(["2.300+", "92%", "4,9 / 5"]);
});

test("reduced motion renders final counters directly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/testimoni");
  await expect(page.locator(".testimonial-kpis [data-counter]")).toHaveText(["2.300+", "92%", "4,9 / 5"]);
});

for (const width of [390, 768, 1440]) {
  test(`footer social links align with 44px targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/testimoni");
    const whatsapp = page.getByRole("link", { name: "Hubungi Hiru Academy melalui WhatsApp" });
    const instagram = page.getByRole("link", { name: "Instagram Hiru Academy", exact: true });
    await expect(whatsapp).toHaveAttribute("href", "https://wa.me/6285314316254");
    await expect(whatsapp).toHaveAttribute("target", "_blank");
    await expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
    await expect(instagram).toHaveAttribute("href", "https://www.instagram.com/hiru_academy?utm_source=ig_web_button_share_sheet&exln=ZDNlZDc0MzIxNw==");
    await whatsapp.scrollIntoViewIfNeeded();
    const [ig, wa] = await page.locator(".public-social a").evaluateAll(links => links.map(link => {
      const { x, y, width, height } = link.getBoundingClientRect();
      return { x, y, width, height };
    }));
    expect(wa).not.toBeNull();
    expect(ig).not.toBeNull();
    expect(wa!.width).toBeGreaterThanOrEqual(44);
    expect(wa!.height).toBeGreaterThanOrEqual(44);
    expect(wa!.width).toBe(ig!.width);
    expect(wa!.height).toBe(ig!.height);
    expect(wa!.y).toBe(ig!.y);
    expect(wa!.x).toBeGreaterThan(ig!.x + ig!.width);
  });
}
