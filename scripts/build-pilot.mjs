import { spawnSync } from "node:child_process";
import { validatePilotEnvironment } from "./pilot-environment.mjs";

validatePilotEnvironment(process.env);
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
