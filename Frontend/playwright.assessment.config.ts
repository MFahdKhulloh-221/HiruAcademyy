import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: ["assessment-persistence.spec.ts", "assessment-backend.spec.ts"],
  use: { ...base.use, baseURL: "http://localhost:3017" },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3017",
    env: { NEXT_PUBLIC_API_URL: "http://localhost:8000", HIRU_PLAYWRIGHT_PORT: "3017" },
    url: "http://localhost:3017",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
