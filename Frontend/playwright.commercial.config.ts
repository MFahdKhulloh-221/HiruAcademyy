import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "commercial-integration.spec.ts",
  use: { ...base.use, baseURL: "http://localhost:3011" },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3011",
    env: { NEXT_PUBLIC_API_URL: "http://localhost:8000", HIRU_PLAYWRIGHT_PORT: "3011" },
    url: "http://localhost:3011",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
