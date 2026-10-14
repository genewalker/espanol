import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { api } from "../../convex/_generated/api";
import { localEnvironment } from "../../scripts/local-environment.mjs";

let credentials: { email: string; password: string };
const backend = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { logger: false });

test.beforeAll(() => {
  // Password is generated server-side, read into memory, never printed or traced.
  const result = execFileSync(process.execPath, [
    "node_modules/convex/bin/main.js", "run", "dev:createGuardian",
    JSON.stringify({ email: `e2e-${randomUUID()}@example.test` }),
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: localEnvironment() });
  credentials = JSON.parse(result);
});

test("svensk startsida, riktig Convex-query, 320px och tillgänglighet", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Glosäventyret", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Anslutningen är klar.");
  expect(await page.locator("html").getAttribute("lang")).toBe("sv");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("skyddade routes nekar anonym session och förfalskad cookie", async ({ page, context }) => {
  await context.addCookies([{ name: "__convexAuthJWT", value: "forged", domain: "127.0.0.1", path: "/" }]);
  for (const path of ["/admin", "/app", "/admin/lists/anything"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Logga in som förälder" })).toBeVisible();
  }
});

test("förälder loggar in, laddar om och loggar ut", async ({ page, context }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Din e-postadress").fill(credentials.email);
  await page.getByLabel("Lösenord", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Välkommen, Förälder" })).toBeVisible();
  const cookies = await context.cookies();
  const authCookies = cookies.filter((cookie) => cookie.name.includes("convexAuth"));
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax")).toBe(true);
  await page.reload();
  await expect(page.getByText("Inga glosor ännu")).toBeVisible();
  await page.getByRole("button", { name: "Logga ut", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("fel lösenord ger begripligt fel utan adminåtkomst", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Din e-postadress").fill(credentials.email);
  await page.getByLabel("Lösenord", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Det gick inte att logga in");
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("direkta API-anrop kan inte registrera eller provisionera konton", async () => {
  const client = backend();
  await expect(client.query(api.users.guardianViewer)).rejects.toThrow();
  await expect(client.action(api.auth.signIn, {
    provider: "password", params: { flow: "signUp", email: "intruder@example.test", password: "not-a-real-password", role: "guardian" },
  })).rejects.toThrow("REGISTRATION_CLOSED");
  await expect(client.action(makeFunctionReference<"action">("dev:createGuardian"), { email: "intruder@example.test" })).rejects.toThrow();
});

test("riktig token fungerar och utloggning återkallar backendåtkomst", async () => {
  const client = backend();
  const result = await client.action(api.auth.signIn, { provider: "password", params: { flow: "signIn", ...credentials } });
  if (!result.tokens) throw new Error("Expected authenticated session");
  client.setAuth(result.tokens.token);
  expect(await client.query(api.users.guardianViewer)).toEqual({ nickname: "Förälder", role: "guardian" });
  await client.action(api.auth.signOut);
  await expect(client.query(api.users.guardianViewer)).rejects.toThrow("UNAUTHENTICATED");
});

test("cross-site auth-POST nekas", async ({ request }) => {
  const response = await request.post("/api/auth", {
    headers: { "sec-fetch-site": "cross-site", origin: "https://untrusted.example" },
    data: { action: "auth:signIn", args: { provider: "password", params: { flow: "signUp" } } },
  });
  expect(response.status()).toBe(403);
});

test("upprepade felaktiga lösenord begränsas av Convex Auth", async () => {
  const client = backend();
  for (let i = 0; i < 5; i++) {
    await expect(client.action(api.auth.signIn, {
      provider: "password", params: { flow: "signIn", email: credentials.email, password: "incorrect-password" },
    })).rejects.toThrow("InvalidSecret");
  }
  await expect(client.action(api.auth.signIn, {
    provider: "password", params: { flow: "signIn", ...credentials },
  })).rejects.toThrow("TooManyFailedAttempts");
});
