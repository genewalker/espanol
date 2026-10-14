import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { localEnvironment } from "./scripts/local-environment.mjs";

loadEnvFile(".env.local");
localEnvironment();
if (!process.env.CONVEX_DEPLOYMENT?.startsWith("anonymous:") && !process.env.CONVEX_DEPLOYMENT?.startsWith("local:")) {
  throw new Error("E2E får bara köras mot lokal Convex.");
}
if (!["127.0.0.1", "localhost"].includes(new URL(process.env.NEXT_PUBLIC_CONVEX_URL!).hostname)) {
  throw new Error("E2E kräver Convex på loopback.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    // Authentication traces and screenshots can contain credentials/tokens.
    trace: "off", screenshot: "off", video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
