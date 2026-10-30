import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests", testMatch: "blog-runtime.spec.ts", workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3411", locale: "id-ID", timezoneId: "Asia/Jakarta", browserName: "chromium", channel: "chromium", launchOptions: { args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"] }, headless: true, trace: "off" },
  webServer: [
    { command: "node tests/blog-http-fixture.mjs", url: "http://127.0.0.1:3412/health", reuseExistingServer: false },
    { command: "npm run start -- --hostname 127.0.0.1 --port 3411", url: "http://127.0.0.1:3411/robots.txt", reuseExistingServer: false, timeout: 120000,
      env: { API_INTERNAL_URL: "http://127.0.0.1:3412", NEXT_PUBLIC_API_URL: "http://127.0.0.1:3412", HIRU_PLAYWRIGHT_PORT: "3411" } },
  ],
});
