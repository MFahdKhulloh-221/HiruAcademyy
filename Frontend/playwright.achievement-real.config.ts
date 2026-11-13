import { defineConfig } from "@playwright/test";

if (!process.env.HIRU_ACHIEVEMENT_BROWSER_DIR) throw new Error("Run guarded achievement browser runner first.");

export default defineConfig({
  testDir: "./tests",
  testMatch: "program-achievement-real.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 20000 },
  outputDir: `${process.env.HIRU_ACHIEVEMENT_BROWSER_DIR}/results`,
  reporter: "list",
  use: { actionTimeout: 20000, navigationTimeout: 30000, baseURL: "http://localhost:3028", browserName: "chromium", channel: "chromium", launchOptions: { args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"] }, locale: "id-ID", timezoneId: "Asia/Jakarta", viewport: { width: 1440, height: 1000 }, trace: "off", screenshot: "off", video: "off" },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3028",
    url: "http://localhost:3028/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: { NEXT_PUBLIC_API_URL: "http://localhost:8027", HIRU_PLAYWRIGHT_PORT: "3028" },
  },
});
