import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function localEnvironment({ allowNew = false } = {}) {
  const file = existsSync(".env.local") ? parseEnv(readFileSync(".env.local", "utf8")) : {};
  const env = { ...process.env, ...file, CONVEX_AGENT_MODE: "anonymous" };
  for (const name of ["CONVEX_DEPLOY_KEY", "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY"]) {
    if (env[name]) throw new Error(`Ta bort ${name} innan lokal utveckling.`);
  }
  const deployment = env.CONVEX_DEPLOYMENT;
  if ((!deployment && !allowNew) || (deployment && !/^(anonymous|local):/.test(deployment))) {
    throw new Error("Endast lokal Convex-instans tillåts av utvecklingsskripten.");
  }
  if (env.NEXT_PUBLIC_CONVEX_URL && !["127.0.0.1", "localhost"].includes(new URL(env.NEXT_PUBLIC_CONVEX_URL).hostname)) {
    throw new Error("Convex-URL måste peka på loopback.");
  }
  return env;
}
