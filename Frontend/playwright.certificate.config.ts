import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["certificate-ui.spec.ts", "system-integration.spec.ts", "identity-logout.spec.ts"],
  grep: /mock API:|certificate settings persist/,
  fullyParallel: false,
  workers: 1,
  use: { ...base.use, baseURL: "http://localhost:3027", serviceWorkers: "block" },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3027",
    env: { HIRU_PLAYWRIGHT_PORT: "3027", NEXT_PUBLIC_API_URL: "http://localhost:8000" },
    url: "http://localhost:3027",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
