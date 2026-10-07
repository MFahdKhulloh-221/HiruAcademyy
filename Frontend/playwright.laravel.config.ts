import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: /laravel-(smoke|regression)\.spec\.ts/,
  testIgnore: [],
  expect: { timeout: 15000 },
  use: { ...base.use, baseURL: "http://localhost:3020" },
  webServer: [{
    command: "node --experimental-strip-types tests/laravel-browser-server.ts",
    url: "http://localhost:8001/sanctum/csrf-cookie",
    reuseExistingServer: false,
    timeout: 120000,
  }, {
    command: "npm run dev -- --hostname localhost --port 3020",
    env: { NEXT_PUBLIC_API_URL: "http://localhost:8001", HIRU_PLAYWRIGHT_PORT: "3020" },
    url: "http://localhost:3020",
    reuseExistingServer: false,
    timeout: 120000,
  }],
});
