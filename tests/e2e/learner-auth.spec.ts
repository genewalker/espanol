import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { localEnvironment } from "../../scripts/local-environment.mjs";
import { defaultOptions, parseVocabulary, prepareRows } from "../../src/lib/vocabulary/parser";

test.setTimeout(120_000);
const oldPassword = "synthetic-browser-password-01";
const newPassword = "synthetic-browser-password-02";
async function parentLogin(page: Page, credentials: { email: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByLabel("Din e-postadress").fill(credentials.email);
  await page.getByLabel("Lösenord", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function childLogin(page: Page, username: string, password: string) {
  await page.goto("/sign-in/learner");
  await page.getByLabel("Användarnamn", { exact: true }).fill(username);
  await page.getByLabel("Lösenord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
}

test("förälder skapar barnkonto → barnet övar → lösenordsbyte → radering, med riktiga sessioner", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const credentials = JSON.parse(execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "run", "dev:createGuardian", JSON.stringify({ email: `learner-${randomUUID()}@example.test` })], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: localEnvironment(),
  })) as { email: string; password: string };
  const parent = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { logger: false });
  const signed = await parent.action(api.auth.signIn, { provider: "password", params: { flow: "signIn", ...credentials } });
  parent.setAuth(signed.tokens!.token);
  const source = "rojo;röd\nazul;blå\nverde;grön\namarillo;gul\nblanco;vit";
  const { listId } = await parent.mutation(api.imports.commitPreviewImport, { requestId: randomUUID(), target: { kind: "new", title: "Barnets färger" }, source, options: defaultOptions, rows: prepareRows(parseVocabulary(source)) });
  await parent.mutation(api.lists.setStatus, { listId, status: "published" });
  const username = `elev-${randomUUID().slice(0,20)}`;
  await parentLogin(page, credentials);
  await page.getByRole("link", { name: "Barnets inloggning", exact: true }).click();
  await page.getByLabel("Smeknamn", { exact: true }).fill("Testäventyrare");
  await page.getByRole("button", { name: "Skapa övningsprofil", exact: true }).click();
  await page.getByLabel("Användarnamn", { exact: true }).fill(username);
  await page.getByLabel("Barnets lösenord", { exact: true }).fill(oldPassword);
  await page.getByLabel("Upprepa lösenordet", { exact: true }).fill(oldPassword);
  await page.getByRole("checkbox").check();
  await page.setViewportSize({ width: 320, height: 720 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Skapa barnets konto", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Barnets konto är klart");
  expect((await parent.query(api.learnerAccounts.status))!.username).toBe(username);

  // Switching roles on a shared device must replace the parent's session.
  await childLogin(page, username, oldPassword);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Hej, Testäventyrare!" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Föräldrasidan", exact: true })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Öva tillsammans" })).toHaveCount(0);
  await page.goto("/admin/learner");
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole("link", { name: "Barnets färger", exact: true }).click();
  await page.getByRole("combobox", { name: "Övningsläge" }).selectOption("written");
  await page.getByRole("combobox", { name: "Antal frågor" }).selectOption("5");
  await page.getByRole("button", { name: "Starta pass", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/practice\//);
  for (let index = 0; index < 5; index++) {
    const prompt = await page.getByRole("heading", { level: 2 }).textContent();
    const answer = source.split("\n").map((row) => row.split(";")).find((row) => row[1] === prompt)![0];
    await page.getByLabel("Ditt svar").fill(answer);
    await page.getByLabel("Ditt svar").press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Facit:" })).toContainText(answer);
    if (index === 0) {
      await page.reload();
      await expect(page.getByRole("status").filter({ hasText: "Facit:" })).toContainText(answer);
    }
    await page.getByRole("button", { name: index === 4 ? "Visa resultat" : "Nästa fråga", exact: true }).click();
    if (index < 4) await expect(page.getByText(`Fråga ${index + 2} av 5 · Skriv svaret`, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Rätt: 5 av 5", { exact: true })).toBeVisible();
  expect((await parent.query(api.rewards.mine))!.totalXp).toBeGreaterThan(0);
  const profileId = (await parent.query(api.learnerAccounts.status))!.profileId;
  const child = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { logger: false });
  const childAuth = await child.action(api.auth.signIn, { provider: "learner-password", params: { flow: "signIn", username, password: oldPassword } });
  child.setAuth(childAuth.tokens!.token);
  await expect(child.query(api.lists.listMine)).rejects.toThrow("FORBIDDEN");

  await page.getByRole("link", { name: "Dina framsteg", exact: true }).click();
  await expect(page.getByText("5 av 5 aktiva ord har besvarats i aktuell version.")).toBeVisible();
  await parentLogin(page, credentials);
  await page.getByRole("link", { name: "Statistik och repetition", exact: true }).click();
  await expect(page.getByText("5 av 5 aktiva ord har besvarats i aktuell version.")).toBeVisible();
  await page.goto("/admin/learner");
  await page.getByLabel("Nytt lösenord", { exact: true }).fill(newPassword);
  await page.getByLabel("Upprepa lösenordet", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Byt lösenord", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Lösenordet är ändrat");
  await expect(child.query(api.practice.home)).rejects.toThrow("UNAUTHENTICATED");
  expect((await child.action(api.auth.signIn, { refreshToken: childAuth.tokens!.refreshToken })).tokens).toBeNull();
  await childLogin(page, username, oldPassword);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Det gick inte att logga in");
  await childLogin(page, username, newPassword);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Hej, Testäventyrare!" })).toBeVisible();
  expect((await parent.query(api.learnerAccounts.status))!.profileId).toBe(profileId);
  await page.getByRole("button", { name: "Logga ut", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in(?:\/learner)?$/);
  await parentLogin(page, credentials);
  await page.goto("/admin/data");
  await page.getByLabel("Skriv RADERA för att bekräfta").fill("RADERA");
  await page.getByRole("button", { name: "Radera övningsprofilen", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Barnets konto, övningsprofil och resultat har raderats");
  expect(await parent.query(api.learnerAccounts.status)).toBeNull();
  expect(await parent.query(api.lists.listMine)).toHaveLength(1);
  await childLogin(page, username, newPassword);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Det gick inte att logga in");
  expect(errors).toEqual([]);
});
