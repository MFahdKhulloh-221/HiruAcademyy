import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "community-http-integration.spec.ts",
  use: { ...base.use, baseURL: "http://localhost:3039" },
  outputDir: "test-results/community-http",
  webServer: [
    {
      command: `${process.platform === "win32" ? "powershell" : "pwsh"} -NoProfile -File tests/community49-http.ps1`,
      cwd: "../Backend",
      url: "http://localhost:8049/up",
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "npx next dev --hostname localhost --port 3039",
      env: { NEXT_PUBLIC_API_URL: "http://localhost:8049", HIRU_PLAYWRIGHT_PORT: "3039" },
      url: "http://localhost:3039",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
