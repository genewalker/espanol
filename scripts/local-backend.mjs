import { spawn } from "node:child_process";
import { localEnvironment } from "./local-environment.mjs";

const child = spawn(process.execPath, ["node_modules/convex/bin/main.js", "dev"], {
  env: localEnvironment({ allowNew: true }), stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => { process.exitCode = code ?? 1; });
