import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function validatePilotEnvironment(env, { backend = false } = {}) {
  const target = env.PILOT_CONVEX_DEPLOYMENT;
  if (!target || !/^dev:[a-z0-9]+(?:-[a-z0-9]+)+$/.test(target)) throw new Error("Piloten kräver PILOT_CONVEX_DEPLOYMENT=dev:<namn>.");
  const name = target.slice(4);
  if (env.NEXT_PUBLIC_CONVEX_URL !== `https://${name}.convex.cloud` || env.NEXT_PUBLIC_CONVEX_SITE_URL !== `https://${name}.convex.site`) throw new Error("Pilotens Convex-URL:er måste matcha vald dev-deployment.");
  let origin;
  try { origin = new URL(env.PILOT_APP_ORIGIN); } catch { throw new Error("Ange pilotens fasta HTTPS-origin i PILOT_APP_ORIGIN."); }
  if (origin.protocol !== "https:" || origin.origin !== env.PILOT_APP_ORIGIN || origin.username || origin.password) throw new Error("PILOT_APP_ORIGIN ska vara en HTTPS-origin utan sökväg.");
  if (env.CONVEX_SELF_HOSTED_URL || env.CONVEX_SELF_HOSTED_ADMIN_KEY) throw new Error("Self-hosted override tillåts inte i pilotkommandon.");
  if (backend) {
    if (!env.CONVEX_DEPLOY_KEY?.startsWith(`${target}|`) || env.CONVEX_DEPLOY_KEY.length <= target.length + 1) throw new Error("Backend kräver en dev-nyckel för exakt vald deployment.");
  } else {
    if (env.VERCEL_ENV !== "preview" || (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== "preview")) throw new Error("Pilotbygget tillåter endast Vercel Preview, aldrig Production.");
    if (env.CONVEX_DEPLOY_KEY) throw new Error("Frontendbygget ska inte ha någon Convex deploy-nyckel. Deploya backend separat.");
  }
  return { name, origin: origin.origin };
}

export function pilotBackendEnvironment() {
  // A separate file avoids replacing .env.local or changing the local watcher.
  const values = parseEnv(readFileSync(".env.pilot.local", "utf8"));
  const env = { ...process.env, ...values };
  validatePilotEnvironment(env, { backend: true });
  delete env.CONVEX_DEPLOYMENT;
  delete env.CONVEX_AGENT_MODE;
  return env;
}
