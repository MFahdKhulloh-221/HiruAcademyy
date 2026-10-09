import { defineConfig } from "@playwright/test";
import config from "./playwright.performance.config";

export default defineConfig({
  ...config,
  testMatch: process.env.HIRU_PERF_IDENTITY ? "performance-identity-baseline.spec.ts" : process.env.HIRU_PERF_PLACEMENT ? "performance-placement-baseline.spec.ts" : "performance-dashboard.spec.ts",
});
