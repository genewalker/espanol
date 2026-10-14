import { spawnSync } from "node:child_process";
import { mkdirSync, chmodSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { localEnvironment } from "./local-environment.mjs";

if (process.argv.length !== 2) throw new Error("Backupkommandot tar inga argument och får bara använda lokal Convex.");
const env = localEnvironment();
process.umask(0o077);
mkdirSync("backups", { recursive: true, mode: 0o700 });
chmodSync("backups", 0o700);
const name = `backups/local-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
const result = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", "export", "--path", name, "--include-file-storage"], { env, encoding: "utf8" });
if (result.status !== 0) throw new Error("Lokal backup misslyckades; kontrollera att backend körs. Inga råa CLI-loggar visas.");
chmodSync(name, 0o600);
const sha256 = createHash("sha256").update(readFileSync(name)).digest("hex");
writeFileSync(`${name}.sha256`, `${sha256}\n`, { mode: 0o600, flag: "wx" });
console.log(`Lokal backup sparad: ${name}. Innehåller privata data och auth-tabeller; förvara skyddat.`);
