import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { localEnvironment } from "./local-environment.mjs";

if (process.env.CI !== "true" || existsSync(".env.local")) throw new Error("CI-testet kräver en ren checkout utan .env.local.");
const env = localEnvironment({ allowNew: true });
const backend = spawn(process.execPath, ["scripts/local-backend.mjs"], { env, stdio: "ignore" });
function run(args) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) throw new Error("CI-kommandot misslyckades.");
}
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (backend.exitCode !== null) throw new Error("Lokal backend kunde inte starta.");
    if (existsSync(".env.local")) {
      const current = localEnvironment();
      try {
        const response = await fetch(`${current.NEXT_PUBLIC_CONVEX_URL}/api/query`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: "health:check", args: {}, format: "json" }), signal: AbortSignal.timeout(1000),
        });
        const result = await response.json();
        ready = result.status === "success" && result.value?.status === "ok";
      } catch { /* still starting */ }
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Lokal backend blev inte redo inom tidsgränsen.");
  run(["scripts/setup-local-auth.mjs"]);
  run(["node_modules/@playwright/test/cli.js", "test"]);
} finally { backend.kill("SIGTERM"); }
