import { expect, test } from "@playwright/test";
import { ADMIN_WHATSAPP_URL } from "../src/lib/admin-whatsapp";

test("footer WhatsApp uses same contact as invoice without activating membership", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => { if (request.method() !== "GET") writes.push(request.url()); });
  await page.route("**/api/**", route => route.fulfill({ json: { data: [] } }));
  await page.goto("/kebijakan-privasi");
  const contact = page.getByRole("link", { name: "Hubungi Hiru Academy melalui WhatsApp" });
  await expect(contact).toHaveAttribute("href", ADMIN_WHATSAPP_URL);
  await expect(contact).toHaveAttribute("target", "_blank");
  await expect(contact).toHaveAttribute("rel", "noopener noreferrer");
  expect(writes).toEqual([]);
});
