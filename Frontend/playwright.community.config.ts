import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = "3039";
export default defineConfig({
  ...base,
  testMatch: ["community-categories.spec.ts", "community-group-chat.spec.ts", "community-report-moderation.spec.ts"],
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  outputDir: "test-results/community-3039",
  webServer: {
    command: `npx next dev --hostname localhost --port ${port}`,
    env: { NEXT_PUBLIC_API_URL: "http://localhost:8000", HIRU_PLAYWRIGHT_PORT: port },
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
