import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: ["testimonials-hero-b4-b5.spec.ts", "landing-blog-b3.spec.ts", "free-chapter-r06.spec.ts"],
  use: { ...base.use, baseURL: "http://localhost:3031", serviceWorkers: "block" },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3031",
    env: { HIRU_PLAYWRIGHT_PORT: "3031", NEXT_PUBLIC_API_URL: "http://localhost:8000" },
    url: "http://localhost:3031",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
