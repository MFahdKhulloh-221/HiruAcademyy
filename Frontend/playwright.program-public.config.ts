import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: ["programs-b6.spec.ts", "program-public-f2a.spec.ts"],
  use: { ...base.use, baseURL: "http://localhost:3032", serviceWorkers: "block" },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3032",
    env: { HIRU_PLAYWRIGHT_PORT: "3032", NEXT_PUBLIC_API_URL: "http://localhost:8000" },
    url: "http://localhost:3032",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
