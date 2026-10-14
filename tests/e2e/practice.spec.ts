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
const colors = [
  ["rojo", "röd"], ["azul", "blå"], ["verde", "grön"], ["amarillo", "gul"], ["blanco", "vit"],
  ["negro", "svart"], ["gris", "grå"], ["marrón", "brun"], ["morado", "lila"], ["dorado", "guldfärgad"],
];
async function setup(words = colors) {
  const credentials = JSON.parse(execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "run", "dev:createGuardian", JSON.stringify({ email: `practice-${randomUUID()}@example.test` })], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: localEnvironment(),
  })) as { email: string; password: string };
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { logger: false });
  const auth = await client.action(api.auth.signIn, { provider: "password", params: { flow: "signIn", ...credentials } });
  if (!auth.tokens) throw new Error("Expected session");
  client.setAuth(auth.tokens.token);
  const source = words.map((row) => row.join(";")).join("\n");
  const { listId } = await client.mutation(api.imports.commitPreviewImport, { requestId: randomUUID(), target: { kind: "new", title: "Färgäventyret" }, source, options: defaultOptions, rows: prepareRows(parseVocabulary(source)) });
  await client.mutation(api.lists.setStatus, { listId, status: "published" });
  return { credentials, client, listId };
}
async function login(page: Page, credentials: Awaited<ReturnType<typeof setup>>["credentials"]) {
  await page.goto("/sign-in");
  await page.getByLabel("Din e-postadress").fill(credentials.email);
  await page.getByLabel("Lösenord", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: "Öva tillsammans", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Dags för ett glosäventyr" })).toBeVisible();
}
async function start(page: Page, listId: Id<"vocabularyLists">, mode: "written" | "multiple_choice" | "flashcard", count = "5", direction = "sv_to_es") {
  await page.goto(`/app/lists/${listId}`);
  await page.getByRole("combobox", { name: "Övningsläge" }).selectOption(mode);
  await page.getByRole("combobox", { name: "Antal frågor" }).selectOption(count);
  await page.getByRole("combobox", { name: "Riktning" }).selectOption(direction);
  await page.getByRole("button", { name: "Starta pass", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/practice\//);
}
const currentSessionId = (page: Page) => new URL(page.url()).pathname.split("/").at(-1) as Id<"practiceSessions">;

test("profil → 10 skrivfrågor → refresh/fortsätt → resultat, mobil och tangentbord", async ({ page }) => {
  const { client, credentials, listId } = await setup();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, credentials);
  await expect(page.getByRole("complementary", { name: "Öva tillsammans" })).toContainText("förälderns inloggning");
  await page.getByLabel("Smeknamn").fill("Glosresenären");
  await page.getByRole("button", { name: "Skapa övningsprofil", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hej, Glosresenären!" })).toBeVisible();
  await start(page, listId, "written", "10");
  const sessionId = currentSessionId(page);
  await page.setViewportSize({ width: 320, height: 720 });
  for (let index = 0; index < 10; index++) {
    await expect(page.getByText(`Fråga ${index + 1} av 10 · Skriv svaret`, { exact: true })).toBeVisible();
    const prompt = await page.getByRole("heading", { level: 2 }).textContent();
    const answer = colors.find((row) => row[1] === prompt)![0];
    const view = await client.query(api.practice.getCurrentQuestion, { sessionId });
    expect(JSON.stringify(view)).not.toContain("correctAnswer");
    expect(JSON.stringify(view)).not.toContain("acceptedAnswers");
    if (index === 0) {
      await page.reload();
      await expect(page.getByRole("heading", { level: 2 })).toHaveText(prompt!);
      expect((await page.getByLabel("Ditt svar").boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    await page.getByLabel("Ditt svar").fill(index === 1 ? "felaktigt" : answer);
    await page.getByLabel("Ditt svar").press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Facit:" })).toContainText(answer);
    if (index === 0) {
      await page.reload();
      await expect(page.getByRole("status").filter({ hasText: "Facit:" })).toContainText(answer);
      await page.getByRole("link", { name: "Övningsstart", exact: true }).click();
      await page.getByRole("link", { name: "Fortsätt öva", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Facit:" })).toContainText(answer);
    }
    await page.getByRole("button", { name: index === 9 ? "Visa resultat" : "Nästa fråga", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/app\/results\//);
  await expect(page.getByRole("heading", { name: "Passet är klart!" })).toBeVisible();
  await expect(page.getByText("Rätt: 9 av 10", { exact: true })).toBeVisible();
  const result = await client.query(api.practice.getResults, { sessionId });
  expect(result.answers).toHaveLength(10);
  expect(result.correctCount).toBe(9);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("flerval i omvänd riktning och fallback på kort lista", async ({ page }) => {
  const { client, credentials, listId } = await setup();
  await client.mutation(api.practice.saveProfile, { nickname: "Alias" });
  await login(page, credentials);
  await start(page, listId, "multiple_choice", "5", "es_to_sv");
  const sessionId = currentSessionId(page);
  for (let index = 0; index < 5; index++) {
    await expect(page.getByText(`Fråga ${index + 1} av 5 · Flerval`, { exact: true })).toBeVisible();
    const prompt = await page.getByRole("heading", { level: 2 }).textContent();
    const answer = colors.find((row) => row[0] === prompt)![1];
    const view = await client.query(api.practice.getCurrentQuestion, { sessionId });
    expect(JSON.stringify(view)).not.toContain("correctOptionId");
    if (view.state !== "question") throw new Error("Expected question");
    expect(new Set(view.question.options?.map((option) => option.text)).size).toBe(view.question.options?.length);
    await page.getByRole("button", { name: answer, exact: true }).click();
    await expect(page.getByText("✓ Rätt svar!", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: index === 4 ? "Visa resultat" : "Nästa fråga", exact: true }).click();
  }
  await expect(page.getByText("Rätt: 5 av 5", { exact: true })).toBeVisible();
  const source = "el gato;katten\nel perro;hunden";
  const tiny = await client.mutation(api.imports.commitPreviewImport, { requestId: randomUUID(), target: { kind: "new", title: "Två djur" }, source, options: defaultOptions, rows: prepareRows(parseVocabulary(source)) });
  await client.mutation(api.lists.setStatus, { listId: tiny.listId, status: "published" });
  await start(page, tiny.listId, "multiple_choice");
  await expect(page.getByText("Fråga 1 av 2 · Skriv svaret", { exact: true })).toBeVisible();
  await expect(page.getByText("Här finns färre än tre olika alternativ. Skriv svaret i stället.")).toBeVisible();
  const prompt = await page.getByRole("heading", { level: 2 }).textContent();
  await page.getByLabel("Ditt svar").fill(prompt === "katten" ? "gato" : "perro");
  await page.getByRole("button", { name: "Rätta", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Facit:" })).toContainText("Kom ihåg artikeln");
});

test("flashcards visar facit först vid vändning, sparar självskattning och stoppar arkiverad lista", async ({ page }) => {
  const { client, credentials, listId } = await setup([["secreto", "hemligt"], ["árbol", "träd"]]);
  await client.mutation(api.practice.saveProfile, { nickname: "Alias" });
  await login(page, credentials);
  await start(page, listId, "flashcard");
  const sessionId = currentSessionId(page);
  await expect(page.getByRole("button", { name: "Kunde", exact: true })).toHaveCount(0);
  const first = await client.query(api.practice.getCurrentQuestion, { sessionId });
  expect(JSON.stringify(first)).not.toContain("correctAnswer");
  expect(JSON.stringify(first)).not.toContain("revealedAnswer");
  await page.getByRole("button", { name: "Vänd kortet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kunde", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Kunde", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kunde", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Självskattning:" })).toContainText("Kunde");
  await page.getByRole("button", { name: "Nästa fråga", exact: true }).click();
  await client.mutation(api.lists.setStatus, { listId, status: "archived" });
  await expect(page.getByRole("alert").filter({ hasText: "Listan är inte längre publicerad" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Vänd kortet", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Avsluta i förtid", exact: true }).click();
  await page.getByRole("button", { name: "Ja, avsluta passet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Passet avslutades i förtid" })).toBeVisible();
  await expect(page.getByText("Självskattning: 1 kunde av 1 kort", { exact: true })).toBeVisible();
  const result = await client.query(api.practice.getResults, { sessionId });
  expect(result.objectiveCount).toBe(0);
  expect(result.answers).toHaveLength(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await client.mutation(api.lists.setStatus, { listId, status: "published" });
  await start(page, listId, "flashcard");
  for (let index = 0; index < 2; index++) {
    await expect(page.getByText(`Fråga ${index + 1} av 2 · Flashcards`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Vänd kortet", exact: true }).click();
    await page.getByRole("button", { name: index ? "Behöver öva" : "Kunde", exact: true }).click();
    await page.getByRole("button", { name: index ? "Visa resultat" : "Nästa fråga", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Passet är klart!" })).toBeVisible();
  await expect(page.getByText("Självskattning: 1 kunde av 2 kort", { exact: true })).toBeVisible();
});

test("riktigt API: parallell start/svar/nästa har en effekt och främmande session nekas", async () => {
  const { client, listId } = await setup([["sí", "ja"]]);
  const foreign = await setup();
  await client.mutation(api.practice.saveProfile, { nickname: "Alias" });
  await foreign.client.mutation(api.practice.saveProfile, { nickname: "Annan" });
  const start = { listId, requestId: randomUUID(), count: 5 as const, mode: "written" as const, direction: "sv_to_es" as const };
  const sessions = await Promise.all([client.mutation(api.practice.startSession, start), client.mutation(api.practice.startSession, start)]);
  expect(sessions[0]).toBe(sessions[1]);
  const sessionId = sessions[0];
  expect(JSON.stringify(await client.query(api.practice.getCurrentQuestion, { sessionId }))).not.toContain("sí");
  await expect(foreign.client.query(api.practice.getCurrentQuestion, { sessionId })).rejects.toThrow("NOT_FOUND");
  const args = { sessionId, questionIndex: 0, submission: { kind: "written" as const, text: "si" } };
  await expect(foreign.client.mutation(api.practice.submitAnswer, args)).rejects.toThrow("NOT_FOUND");
  const answers = await Promise.all([client.mutation(api.practice.submitAnswer, args), client.mutation(api.practice.submitAnswer, args)]);
  expect(answers[0]).toEqual(answers[1]);
  expect(answers[0]).toMatchObject({ isCorrect: false, hint: expect.stringContaining("accenten") });
  await Promise.all([client.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 }), client.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 })]);
  const results = await client.query(api.practice.getResults, { sessionId });
  expect(results.answers).toHaveLength(1);
  expect(results.correctCount).toBe(0);
  await expect(foreign.client.query(api.practice.getResults, { sessionId })).rejects.toThrow("NOT_FOUND");
});
