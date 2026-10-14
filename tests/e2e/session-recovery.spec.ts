import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { localEnvironment } from "../../scripts/local-environment.mjs";

let credentials: { email: string; password: string };
test.beforeAll(() => {
  credentials = JSON.parse(execFileSync(process.execPath, [
    "node_modules/convex/bin/main.js", "run", "dev:createGuardian",
    JSON.stringify({ email: `session-${randomUUID()}@example.test` }),
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: localEnvironment() }));
});

async function login(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Din e-postadress").fill(credentials.email);
  await page.getByLabel("Lösenord", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Inga glosor ännu")).toBeVisible();
}

async function revoke(context: BrowserContext) {
  // Revoke the actual session without updating this browser's still-valid JWT.
  // Keep tokens only in memory; do not include them in assertions or traces.
  const token = (await context.cookies()).find((cookie) => cookie.name === "__convexAuthJWT")?.value;
  if (!token) throw new Error("Expected a session cookie");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { logger: false });
  client.setAuth(token);
  await client.action(api.auth.signOut);
}

for (const path of ["/admin", "/app"]) {
  test(`återkallad session på ${path} kan logga in igen med samma konto`, async ({ page, context }) => {
    await login(page);
    if (path === "/app") {
      await page.getByRole("link", { name: "Öva tillsammans", exact: true }).click();
      await expect(page.getByRole("button", { name: "Skapa övningsprofil" })).toBeVisible();
    }
    await revoke(context);
    await expect(page.getByText("Din inloggning har gått ut. Logga in igen för att fortsätta.")).toBeVisible();
    await page.getByRole("link", { name: "Logga in igen", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await login(page);
    await page.reload();
    await expect(page.getByText("Inga glosor ännu")).toBeVisible();
  });
}

test("gammal sessionscookie vid sidladdning leder till inloggning", async ({ page, context }) => {
  await login(page);
  await page.goto("/");
  await revoke(context);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in$/);
  await login(page);
});

test("återinloggning från en redan inloggad flik fungerar", async ({ page }) => {
  await login(page);
  await login(page);
});
