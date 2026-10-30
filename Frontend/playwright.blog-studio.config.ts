import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests", testMatch: ["blog-builder.spec.ts", "blog-block-editor.spec.ts", "blog-studio.spec.ts", "blog-navigation.spec.ts", "blog-catalogs.spec.ts", "blog-dashboard.spec.ts", "admin-website.spec.ts"], workers: 1, timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3415", locale: "id-ID", timezoneId: "Asia/Jakarta", channel: "chromium", launchOptions: { args: ["--disable-gpu", "--no-sandbox"] } },
  webServer: [{ command: "node tests/blog-http-fixture.mjs", url: "http://127.0.0.1:3412/health", reuseExistingServer: false }, { command: "npm run dev -- --hostname 127.0.0.1 --port 3415", url: "http://127.0.0.1:3415/admin/blog-seo", reuseExistingServer: false, timeout: 120000, env: { API_INTERNAL_URL: "http://127.0.0.1:3412", HIRU_PLAYWRIGHT_PORT: "3415", NEXT_PUBLIC_API_URL: "http://127.0.0.1:3415" } }],
});
