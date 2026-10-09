import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const output = process.env.HIRU_PERF_OUTPUT ?? join(tmpdir(), "opencode", "hiru-performance-baseline");

export default defineConfig({
  testDir: "./tests",
  testMatch: "performance-loading.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: join(output, "artifacts"),
  reporter: [["list"], ["json", { outputFile: join(output, "playwright.json") }]],
  use: {
    baseURL: "http://127.0.0.1:3027",
    browserName: "chromium",
    channel: "chromium",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
    trace: "off",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3027",
    env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:8027", HIRU_PLAYWRIGHT_PORT: process.env.HIRU_PERF_BUILD_PORT ?? "3027", NEXT_TELEMETRY_DISABLED: "1" },
    url: "http://127.0.0.1:3027/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
