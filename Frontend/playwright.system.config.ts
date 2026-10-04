import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({ ...base, testMatch: "system-integration.spec.ts", use: { ...base.use, baseURL: "http://localhost:3016" }, webServer: { command: "npm run dev -- --hostname localhost --port 3016", env: { NEXT_PUBLIC_API_URL: "http://localhost:8000", HIRU_PLAYWRIGHT_PORT: "3016" }, url: "http://localhost:3016", reuseExistingServer: false, timeout: 120000 } });
