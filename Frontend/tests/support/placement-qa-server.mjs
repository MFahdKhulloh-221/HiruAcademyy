import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.HIRU_PLACEMENT_SCHEMA_READY !== "1") throw new Error("Review Placement migrations and confirm local QA schema setup before running isolated migration.");
const support = dirname(fileURLToPath(import.meta.url));
const backend = resolve(support, "../../../Backend");
const env = {
  ...process.env,
  APP_ENV: "testing", DB_CONNECTION: "pgsql", DB_DATABASE: "hiru_academy_test", DB_URL: "",
  HIRU_TEST_SCHEMA: `hiru_browser_test_placement_${randomUUID().replaceAll("-", "")}`,
  APP_URL: "http://localhost:8026", LARAVEL_PUBLIC_PATH: resolve(backend, "public"),
  CACHE_STORE: "file", HIRU_BROWSER_RUN: `placement_${process.pid}`, SESSION_DRIVER: "file",
  SESSION_COOKIE: "hiru_placement_qa_session", SESSION_SECURE_COOKIE: "false",
  SANCTUM_STATEFUL_DOMAINS: "localhost:3026,localhost:8026", CORS_ALLOWED_ORIGINS: "http://localhost:3026",
};
// Existing safety gate migrates only this fresh, uniquely named test schema; never resets DB.
for (const script of [resolve(backend, "tests/prepare-schema.php"), resolve(support, "placement-qa-fixture.php")]) {
  const result = spawnSync("php", [script], { cwd: backend, env, stdio: "inherit" });
  if (result.error || result.status !== 0) process.exit(1);
}
const server = spawn("php", ["-S", "localhost:8026", resolve(support, "placement-qa-router.php")], { cwd: resolve(backend, "public"), env, stdio: "inherit" });
server.on("error", () => process.exit(1));
server.on("exit", code => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
