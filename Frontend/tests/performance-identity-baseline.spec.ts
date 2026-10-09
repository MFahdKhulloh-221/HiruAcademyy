import { test } from "@playwright/test";
import "./identity-logout.spec";

test.beforeEach(async ({ page, context, baseURL }) => {
  if (process.env.HIRU_PERF_IDENTITY_COOKIE) await context.addCookies([{ name: "XSRF-TOKEN", value: "test-token", url: baseURL! }]);
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.fallback() : route.fulfill({ body: "", contentType: url.hostname === "fonts.googleapis.com" ? "text/css" : "text/plain" });
  });
});

test.afterEach(async ({ page }) => {
  console.log(`IDENTITY_EVIDENCE ${JSON.stringify({ title: test.info().title, status: test.info().status, url: page.url(), headings: await page.getByRole("heading").allTextContents(), devOverlay: await page.locator("nextjs-portal").count() })}`);
});
