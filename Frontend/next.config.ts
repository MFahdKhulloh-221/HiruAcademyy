import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.HIRU_PLAYWRIGHT_PORT ? `.next/playwright-${process.env.HIRU_PLAYWRIGHT_PORT}` : ".next",
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
