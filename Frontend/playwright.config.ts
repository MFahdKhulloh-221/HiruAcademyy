import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    browserName: "chromium",
    channel: "chromium",
    launchOptions: { args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3000",
    env: { NEXT_PUBLIC_API_URL: "http://localhost:8000" },
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
