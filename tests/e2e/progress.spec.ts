import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { localEnvironment } from "../../scripts/local-environment.mjs";
import { defaultOptions, parseVocabulary, prepareRows } from "../../src/lib/vocabulary/parser";

test.setTimeout(90_000);
const colors: Record<string, string> = { röd: "rojo", blå: "azul", grön: "verde" };
async function setup(page: Page, source = "rojo;röd\nazul;blå\nverde;grön") {
  const credentials = JSON.parse(execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "run", "dev:createGuardian", JSON.stringify({ email: `progress-${randomUUID()}@example.test` })], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: localEnvironment(),
  })) as { email: string; password: string };
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { logger: false });
  const auth = await client.action(api.auth.signIn, { provider: "password", params: { flow: "signIn", ...credentials } });
  if (!auth.tokens) throw new Error("Expected session");
  client.setAuth(auth.tokens.token);
  const { listId } = await client.mutation(api.imports.commitPreviewImport, { requestId: randomUUID(), target: { kind: "new", title: "Färger att repetera" }, source, options: defaultOptions, rows: prepareRows(parseVocabulary(source)) });
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

async function start(page: Page, listId: Id<"vocabularyLists">, mode = "written", selection = "recommended") {
  await page.goto(`/app/lists/${listId}?selection=${selection}`);
  await page.getByRole("combobox", { name: "Övningsläge" }).selectOption(mode);
  await page.getByRole("button", { name: "Starta pass", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/practice\//);
}
async function finishWritten(page: Page, count: number, wrongBlue = false) {
  for (let i = 0; i < count; i++) {
    await expect(page.getByText(`Fråga ${i + 1} av ${count} · Skriv svaret`, { exact: true })).toBeVisible();
    const prompt = (await page.getByRole("heading", { level: 2 }).textContent())!;
    await page.getByLabel("Ditt svar").fill(wrongBlue && prompt === "blå" ? "fel" : colors[prompt]);
    await page.getByLabel("Ditt svar").press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Facit:" })).toBeVisible();
    await page.getByRole("button", { name: i === count - 1 ? "Visa resultat" : "Nästa fråga", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/app\/results\//);
}

test("övning → nivågrupper → svåra ord → reaktiv föräldrarapport och versionering", async ({ page }) => {
  const { client, listId } = await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page, listId);
  await finishWritten(page, 3, true);
  await page.getByRole("link", { name: "Se dina framsteg", exact: true }).click();
  await expect(page.getByText("1 ord är dags att repetera", { exact: false })).toBeVisible();
  await start(page, listId);
  await finishWritten(page, 3);
  const priorResult = page.url();
  await page.getByRole("link", { name: "Se dina framsteg", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dina framsteg", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Behöver övas · 1", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "På väg · 2", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "På väg", exact: true })).toContainText("Nästa repetition:");
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await page.getByRole("combobox", { name: "Gloslista" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "På väg · 2", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Öva de svåra igen", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Vilka ord?" })).toHaveValue("difficult");
  await page.getByRole("button", { name: "Starta pass", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("blå");
  await finishWritten(page, 1);
  await page.goto(`/admin/progress?list=${listId}`);
  await expect(page.getByText("3 av 3 aktiva ord har besvarats i aktuell version.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "På väg · 3", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Senaste avslutade passet" })).toContainText("1 av 1 rätt (100 %)");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const words = await client.query(api.words.listForAdmin, { listId });
  const red = words.find((word) => word.spanish === "rojo")!;
  await client.mutation(api.words.updateWord, { wordId: red._id, expectedVersion: 1, spanish: "roja", swedish: "röd", acceptedSpanish: [], acceptedSwedish: [] });
  await expect(page.getByRole("heading", { name: "Behöver övas · 1", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Behöver övas", exact: true })).toContainText("roja");
  await expect(page.getByText("2 av 3 aktiva ord har besvarats i aktuell version.")).toBeVisible();
  await page.goto(priorResult);
  await expect(page.getByText("Rätt: 3 av 3", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("flashcards rapporteras som självskattning och arkivering bevarar föräldrarapporten", async ({ page }) => {
  const { client, listId } = await setup(page, "rojo;röd");
  await start(page, listId, "flashcard");
  await page.getByRole("button", { name: "Vänd kortet", exact: true }).click();
  await page.getByRole("button", { name: "Kunde", exact: true }).click();
  await page.getByRole("button", { name: "Visa resultat", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/results\//);
  await expect(page.getByRole("heading", { name: "Passet är klart!", exact: true })).toBeVisible();
  await page.goto(`/admin/progress?list=${listId}`);
  const latest = page.getByRole("region", { name: "Senaste avslutade passet" });
  await expect(latest).toContainText("Inga objektivt rättade frågor");
  await expect(latest).toContainText("Självskattning: 1 av 1");
  await expect(latest).not.toContainText("%");
  await client.mutation(api.lists.setStatus, { listId, status: "archived" });
  await expect(page.getByText("Arkiverad · Glosresenären", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Öva rekommenderat", exact: true })).toHaveCount(0);
  await page.goto("/app/progress");
  await expect(page.getByText("Inga gloslistor att visa ännu.", { exact: false })).toBeVisible();
  await expect(client.query(api.progress.myOverview, { listId })).rejects.toThrow();
});

test("ett tomt urval av svåra ord ger begripligt fel och kan ändras utan omladdning", async ({ page }) => {
  const { listId } = await setup(page);
  await page.goto(`/app/lists/${listId}?selection=difficult`);
  await page.getByRole("button", { name: "Starta pass", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Inga svåra ord" })).toBeVisible();
  await page.getByRole("combobox", { name: "Vilka ord?" }).selectOption("all");
  await page.getByRole("button", { name: "Starta pass", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/practice\//);
  await expect(page.getByText("Fråga 1 av 3 · Skriv svaret", { exact: true })).toBeVisible();
});
