import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import base from "./playwright.config";

const output = join(tmpdir(), "opencode", "hiru-skeleton-regression");

export default defineConfig({
  ...base,
  testMatch: ["loading-skeleton.spec.ts", "mini-learning-regression.spec.ts", "assessment-persistence.spec.ts"],
  retries: 0,
  timeout: 60000,
  outputDir: join(output, "artifacts"),
  reporter: [["list"], ["json", { outputFile: join(output, "playwright.json") }]],
  use: { ...base.use, baseURL: "http://localhost:3017", channel: "msedge", serviceWorkers: "block", screenshot: "only-on-failure" },
  webServer: {
    command: "npm run start -- --hostname localhost --port 3017",
    env: { NEXT_PUBLIC_API_URL: "http://localhost:8000", HIRU_PLAYWRIGHT_PORT: "3017", NEXT_TELEMETRY_DISABLED: "1" },
    url: "http://localhost:3017/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
