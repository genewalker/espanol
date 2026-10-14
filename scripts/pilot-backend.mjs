import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { pilotBackendEnvironment, validatePilotEnvironment } from "./pilot-environment.mjs";

const command = process.argv[2];
if (!["deploy", "setup-auth"].includes(command) || process.argv.length !== 3) throw new Error("Använd: npm run pilot:backend -- deploy|setup-auth");
const env = pilotBackendEnvironment();
const target = validatePilotEnvironment(env, { backend: true });
function convex(args, input) {
  const result = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", ...args], { env, input, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Pilotkommandot misslyckades. Kontrollera vald dev-deployment och behörighet. CLI-utdata visas inte eftersom de kan innehålla hemligheter.");
  return result.stdout;
}
if (command === "deploy") {
  convex(["deploy", "--yes"]);
  console.log("Backend publicerad till vald Convex dev-deployment.");
} else {
  const configured = convex(["env", "list"]);
  const hasPrivate = /^JWT_PRIVATE_KEY=/m.test(configured);
  const hasPublic = /^JWKS=/m.test(configured);
  if (hasPrivate !== hasPublic) throw new Error("Ofullständigt nyckelpar. Inga nycklar ändrades.");
  if (!hasPrivate) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    convex(["env", "set", "JWT_PRIVATE_KEY"], privateKey.export({ type: "pkcs8", format: "pem" }).trimEnd().replace(/\n/g, " "));
    convex(["env", "set", "JWKS"], JSON.stringify({ keys: [{ use: "sig", ...publicKey.export({ format: "jwk" }) }] }));
  }
  convex(["env", "set", "SITE_URL"], target.origin);
  convex(["env", "set", "PILOT_DEPLOYMENT_NAME"], target.name);
  convex(["env", "set", "AUTH_LOG_LEVEL"], "ERROR");
  convex(["env", "set", "AUTH_LOG_SECRETS"], "false");
  console.log("Pilotens auth är konfigurerad. Befintliga nycklar har bevarats.");
}
