import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { localEnvironment } from "./local-environment.mjs";

const env = localEnvironment();
function convex(args, input) {
  const result = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", ...args], {
    env, input, encoding: "utf8",
  });
  // CLI output can contain secrets. Never echo stdout/stderr on failures.
  if (result.status !== 0) throw new Error("Lokal auth-konfiguration misslyckades. Kontrollera att npm run dev:backend körs.");
  return result.stdout;
}
const configured = convex(["env", "list"]);
const hasPrivate = /^JWT_PRIVATE_KEY=/m.test(configured);
const hasPublic = /^JWKS=/m.test(configured);
if (hasPrivate !== hasPublic) throw new Error("Ofullständigt nyckelpar. Åtgärda lokalt innan du fortsätter; inga nycklar ändrades.");
if (!hasPrivate) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).trimEnd().replace(/\n/g, " ");
  const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey.export({ format: "jwk" }) }] });
  convex(["env", "set", "JWT_PRIVATE_KEY"], pem);
  convex(["env", "set", "JWKS"], jwks);
}
convex(["env", "set", "SITE_URL"], "http://localhost:3000");
console.log("Lokal Convex Auth är konfigurerad. Befintliga nycklar har bevarats.");
