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
const colors: Record<string, string> = { röd: "rojo", blå: "azul", grön: "verde", gul: "amarillo", svart: "negro", vit: "blanco", rosa: "rosa", lila: "morado", brun: "marrón", orange: "naranja" };
const source = Object.entries(colors).map(([sv, es]) => `${es};${sv}`).join("\n");
async function setup(page: Page, source = "rojo;röd\nazul;blå\nverde;grön") {
  const credentials = JSON.parse(execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "run", "dev:createGuardian", JSON.stringify({ email: `rewards-${randomUUID()}@example.test` })], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: localEnvironment(),
  })) as { email: string; password: string };
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { logger: false });
  const auth = await client.action(api.auth.signIn, { provider: "password", params: { flow: "signIn", ...credentials } });
  if (!auth.tokens) throw new Error("Expected session");
  client.setAuth(auth.tokens.token);
  const { listId } = await client.mutation(api.imports.commitPreviewImport, { requestId: randomUUID(), target: { kind: "new", title: "Färgutmaningen" }, source, options: defaultOptions, rows: prepareRows(parseVocabulary(source)) });
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

async function challenge(page: Page, listId: Id<"vocabularyLists">, correctCount: number, reload = false) {
  await page.goto(`/app/lists/${listId}`);
  await page.getByRole("combobox", { name: "Övningsläge" }).selectOption("mixed_boss");
  await expect(page.getByRole("heading", { name: "Veckans utmaning", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Antal frågor" })).toHaveCount(0);
  await page.getByRole("button", { name: "Starta pass", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/practice\//);
  const sessionId = page.url().split("/").at(-1)! as Id<"practiceSessions">;
  let written = 0;
  for (let index = 0; index < 10; index++) {
    await expect(page.getByText(`Fråga ${index + 1} av 10 ·`, { exact: false })).toBeVisible();
    const prompt = (await page.getByRole("heading", { level: 2 }).textContent())!;
    const success = index < correctCount;
    const input = page.getByLabel("Ditt svar", { exact: true });
    if (await input.count()) {
      written++;
      await expect(input).toBeFocused();
      await input.fill(success ? colors[prompt] : "fel");
      await input.press("Enter");
    } else {
      const options = page.getByRole("group", { name: "Välj ett svar" }).getByRole("button");
      const choice = success ? page.getByRole("button", { name: colors[prompt], exact: true }) : options.filter({ hasNotText: colors[prompt] }).first();
      await choice.focus();
      await choice.press("Enter");
    }
    const feedback = page.getByRole("status").filter({ hasText: "Facit:" });
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText(success ? /\+(10|6) XP/ : "0 XP denna gång");
    if (reload && index === 0) {
      await page.reload();
      await expect(feedback).toBeVisible();
      expect(await feedback.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
    }
    const next = page.getByRole("button", { name: index === 9 ? "Visa resultat" : "Nästa fråga", exact: true });
    await next.focus();
    await next.press("Enter");
  }
  expect(written).toBe(5);
  await expect(page).toHaveURL(/\/app\/results\//);
  await expect(page.getByRole("heading", { name: "Passet är klart!", exact: true })).toBeVisible();
  return sessionId;
}

test("utmaning: 80 %, XP, märken, omladdning, tangentbord, reduced motion och mobilvy", async ({ page }) => {
  const { client, listId } = await setup(page, source);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const sessionId = await challenge(page, listId, 8, true);
  await expect(page.getByRole("heading", { name: "Utmaningen klarad!", exact: true })).toBeVisible();
  const rewards = (await client.query(api.rewards.mine, {}))!;
  expect(rewards.badges.map((badge) => badge.code).sort()).toEqual(["first_session", "weekly_challenge"]);
  const earned = rewards.totalXp;
  await expect(page.getByText(`+${earned} XP i passet`, { exact: true })).toBeVisible();
  const before = page.getByRole("region", { name: "XP och märken" });
  await expect(before.getByText("Nytt märke! ✓ Intjänat", { exact: true })).toHaveCount(2);
  await client.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 9 });
  await page.reload();
  await expect(page.getByText(`${earned} XP totalt`, { exact: false })).toBeVisible();
  expect((await client.query(api.rewards.mine, {}))).toEqual(rewards);
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Se dina framsteg", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dina framsteg", exact: true })).toBeVisible();
  await expect(page.getByText(`${earned} XP totalt`, { exact: false })).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Hej, Glosresenären!", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page.locator(".adventure-hero")).toHaveCSS("background-color", "rgb(231, 240, 230)");
  await expect(page.locator(".badge-earned").first()).toHaveCSS("background-color", "rgb(249, 237, 201)");
  await page.setViewportSize({ width: 390, height: 844 });
  // Synthetic account only; no credentials, cookies or auth traces in artifacts.
  if (process.env.GLOSA_VISUAL_REVIEW === "1") await page.screenshot({ path: `/tmp/glosaventyret-iteration4-final-${test.info().project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("70 % ger uppmuntran utan utmaningsmärke, nytt försök kan lyckas och arkiv behåller belöningar", async ({ page }) => {
  const { client, listId } = await setup(page, source);
  await challenge(page, listId, 7);
  await expect(page.getByRole("heading", { name: "Du har tränat inför nästa utmaning" })).toBeVisible();
  const first = (await client.query(api.rewards.mine, {}))!;
  expect(first.badges.map((badge) => badge.code)).toEqual(["first_session"]);
  await challenge(page, listId, 10);
  await expect(page.getByRole("heading", { name: "Utmaningen klarad!", exact: true })).toBeVisible();
  expect((await client.query(api.rewards.mine, {}))!.badges.filter((b) => b.code === "weekly_challenge")).toHaveLength(1);
  await client.mutation(api.lists.setStatus, { listId, status: "archived" });
  await expect(page.getByText("Listan är inte publicerad just nu.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Öva listan igen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Välj gloslista", exact: true })).toBeVisible();
});
