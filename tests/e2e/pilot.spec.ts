import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { localEnvironment } from "../../scripts/local-environment.mjs";
import { defaultOptions, parseVocabulary, prepareRows } from "../../src/lib/vocabulary/parser";

test.setTimeout(90_000);
const colors: Record<string, string> = { röd: "rojo", blå: "azul", grön: "verde", gul: "amarillo", svart: "negro", vit: "blanco", rosa: "rosa", lila: "morado", brun: "marrón", orange: "naranja" };
const source = Object.entries(colors).map(([sv, es]) => `${es};${sv}`).join("\n");
async function setup(page: Page, source = "rojo;röd\nazul;blå\nverde;grön") {
  const credentials = JSON.parse(execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "run", "dev:createGuardian", JSON.stringify({ email: `pilot-${randomUUID()}@example.test` })], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: localEnvironment(),
  })) as { email: string; password: string };
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { logger: false });
  const auth = await client.action(api.auth.signIn, { provider: "password", params: { flow: "signIn", ...credentials } });
  if (!auth.tokens) throw new Error("Expected session");
  client.setAuth(auth.tokens.token);
  const { listId } = await client.mutation(api.imports.commitPreviewImport, { requestId: randomUUID(), target: { kind: "new", title: "Pilotens färger" }, source, options: defaultOptions, rows: prepareRows(parseVocabulary(source)) });
  await client.mutation(api.lists.setStatus, { listId, status: "published" });
  await client.mutation(api.practice.saveProfile, { nickname: "Glosresenären" });
  await page.goto("/sign-in");
  await page.getByLabel("Din e-postadress").fill(credentials.email);
  await page.getByLabel("Lösenord", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Välkommen, Förälder" })).toBeVisible();
  return { client, listId };
}

test("familjepilot: tre pass, framsteg, JSON-export och fullständig profilradering", async ({ page }) => {
  const { client, listId } = await setup(page, source);
  for (const mode of ["written", "multiple_choice", "flashcard"]) {
    await page.goto(`/app/lists/${listId}`);
    await page.getByRole("combobox", { name: "Övningsläge" }).selectOption(mode);
    await page.getByRole("button", { name: "Starta pass", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/practice\//);
    for (let i = 0; i < 5; i++) {
      await expect(page.getByText(`Fråga ${i + 1} av 5 ·`, { exact: false })).toBeVisible();
      const prompt = (await page.getByRole("heading", { level: 2 }).textContent())!;
      if (mode === "written") { await page.getByLabel("Ditt svar", { exact: true }).fill(colors[prompt]); await page.getByLabel("Ditt svar", { exact: true }).press("Enter"); }
      else if (mode === "multiple_choice") await page.getByRole("button", { name: colors[prompt], exact: true }).click();
      else { await page.getByRole("button", { name: "Vänd kortet", exact: true }).click(); await page.getByRole("button", { name: "Kunde", exact: true }).click(); }
      await page.getByRole("button", { name: i === 4 ? "Visa resultat" : "Nästa fråga", exact: true }).click();
    }
    await expect(page).toHaveURL(/\/app\/results\//);
    await expect(page.getByRole("heading", { name: "Passet är klart!", exact: true })).toBeVisible();
  }
  expect((await client.query(api.practice.home, {})).recent).toHaveLength(3);
  expect((await client.query(api.rewards.mine, {}))!.totalXp).toBe(90);
  await page.goto(`/admin/progress?list=${listId}`);
  await expect(page.getByRole("region", { name: "Senaste avslutade passet" })).toContainText("Självskattning: 5 av 5");
  await page.goto("/admin/data");
  await expect(page.getByRole("heading", { name: "Dina data", exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Hämta JSON", exact: true }).click();
  const download = await downloadPromise;
  const data = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(data.formatVersion).toBe(1);
  expect(data.words).toHaveLength(10);
  expect(data.profile.totalXp).toBe(90);
  expect(JSON.stringify(data)).not.toMatch(/password|authSession|correctOptionId/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const button = page.getByRole("button", { name: "Radera övningsprofilen", exact: true });
  await expect(button).toBeDisabled();
  await page.getByLabel("Skriv RADERA för att bekräfta").fill("RADERA");
  await button.click();
  await expect(page.getByText("Barnets konto, övningsprofil och resultat har raderats.", { exact: false })).toBeVisible();
  expect(await client.query(api.data.profile, {})).toBeNull();
  expect((await client.query(api.words.listForAdmin, { listId }))).toHaveLength(10);
  await page.goto("/app");
  await expect(page.getByText("Skapa en övningsprofil", { exact: true })).toBeVisible();
});

test("avbruten radering kan fortsätta efter omladdning; pilotbootstrap är inte publikt", async ({ page, request }) => {
  const { client } = await setup(page);
  const profile = (await client.query(api.data.profile, {}))!;
  await client.mutation(api.data.beginProfileDeletion, { profileId: profile.profileId, confirmation: "RADERA" });
  await page.goto("/admin/data");
  await page.reload();
  await expect(page.getByRole("button", { name: "Hämta JSON", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Fortsätt raderingen", exact: true }).click();
  await expect(page.getByText("Ingen övningsprofil finns att radera.", { exact: true })).toBeVisible();
  const rejected = await request.post(`${process.env.NEXT_PUBLIC_CONVEX_URL}/api/action`, { data: { path: "pilot:createGuardian", args: { email: "blocked@example.test" }, format: "json" } });
  expect((await rejected.json()).status).toBe("error");
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ status: "ok" });
  expect(health.headers()["cache-control"]).toBe("no-store");
  expect(health.headers()["x-frame-options"]).toBe("DENY");
  expect(health.headers()["referrer-policy"]).toBe("no-referrer");
});
