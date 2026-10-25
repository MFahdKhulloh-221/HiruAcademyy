import { defineConfig } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import base from "./playwright.config";

const real = process.env.HIRU_PLACEMENT_REAL_QA === "1";
if (real && !process.env.HIRU_PLACEMENT_QA_IDENTITY) {
  const temp = join(process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Temp") : tmpdir(), "opencode");
  mkdirSync(temp, { recursive: true });
  process.env.HIRU_PLACEMENT_QA_IDENTITY = join(mkdtempSync(join(temp, "placement-qa-")), "identity.json");
}

export default defineConfig({
  ...base,
  testMatch: /placement-adaptive-(real|persistence)\.spec\.ts/,
  testIgnore: [],
  expect: { timeout: 15000 },
  outputDir: join(process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Temp") : tmpdir(), "opencode", `placement-results-${process.pid}`),
  use: { ...base.use, baseURL: "http://localhost:3026" },
  webServer: real ? [{
    command: "node tests/support/placement-qa-server.mjs",
    env: { HIRU_PLACEMENT_QA_IDENTITY: process.env.HIRU_PLACEMENT_QA_IDENTITY! },
    url: "http://localhost:8026/sanctum/csrf-cookie",
    reuseExistingServer: false,
    timeout: 120000,
  }, {
    command: "npm run dev -- --hostname localhost --port 3026",
    env: { NEXT_PUBLIC_API_URL: "http://localhost:8026", HIRU_PLAYWRIGHT_PORT: "3026" },
    url: "http://localhost:3026",
    reuseExistingServer: false,
    timeout: 120000,
  }] : undefined,
});
