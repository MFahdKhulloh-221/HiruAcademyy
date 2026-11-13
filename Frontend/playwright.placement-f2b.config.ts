import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: ["placement-instructions.spec.ts", "placement-result-r01.spec.ts", "placement-sticky-r03.spec.ts", "placement-public.spec.ts", "placement-f2b-edge.spec.ts"],
  use: { ...base.use, baseURL: "http://localhost:3033", serviceWorkers: "block" },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3033",
    env: { HIRU_PLAYWRIGHT_PORT: "3033", NEXT_PUBLIC_API_URL: "http://localhost:8000" },
    url: "http://localhost:3033",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
