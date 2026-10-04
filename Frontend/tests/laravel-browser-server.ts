import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const env = {
  ...process.env,
  APP_ENV: "testing",
  DB_CONNECTION: "pgsql",
  DB_DATABASE: "hiru_academy_test",
  DB_URL: "",
  HIRU_TEST_SCHEMA: `hiru_browser_test_${process.pid}_${Date.now()}`,
  APP_URL: "http://localhost:8001",
  LARAVEL_PUBLIC_PATH: resolve("../Backend/public"),
  CACHE_STORE: "file",
  HIRU_BROWSER_RUN: String(process.pid),
  SESSION_DRIVER: "file",
  SESSION_SECURE_COOKIE: "false",
  SANCTUM_STATEFUL_DOMAINS: "localhost:3020,localhost:8001",
  CORS_ALLOWED_ORIGINS: "http://localhost:3020",
};
const schema = spawnSync("php", ["tests/prepare-schema.php"], { cwd: resolve("../Backend"), env, stdio: "inherit" });
if (schema.error || schema.status !== 0) process.exit(1);
const fixture = spawnSync("php", ["tests/laravel-browser-fixture.php"], { env, stdio: "inherit" });
if (fixture.error || fixture.status !== 0) process.exit(1);
const server = spawn("php", ["-S", "localhost:8001", resolve("tests/laravel-browser-router.php")], { cwd: resolve("../Backend/public"), env, stdio: "inherit" });
server.on("error", () => process.exit(1));
server.on("exit", code => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.kill(signal));
