import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "learning-integration.spec.ts",
  use: { ...base.use, baseURL: "http://localhost:3013" },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3013",
    env: { NEXT_PUBLIC_API_URL: "http://localhost:8000", HIRU_PLAYWRIGHT_PORT: "3013" },
    url: "http://localhost:3013",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
