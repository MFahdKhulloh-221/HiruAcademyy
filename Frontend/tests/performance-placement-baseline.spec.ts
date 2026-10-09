import { test } from "@playwright/test";
import "./placement-public.spec";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.fallback() : route.fulfill({ body: "", contentType: url.hostname === "fonts.googleapis.com" ? "text/css" : "text/plain" });
  });
});
