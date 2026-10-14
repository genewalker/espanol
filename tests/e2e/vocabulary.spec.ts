import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { localEnvironment } from "../../scripts/local-environment.mjs";
import { defaultOptions, parseVocabulary, prepareRows } from "../../src/lib/vocabulary/parser";

test.setTimeout(90_000);

function account() {
  const output = execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "run", "dev:createGuardian", JSON.stringify({ email: `lists-${randomUUID()}@example.test` })], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: localEnvironment(),
  });
  return JSON.parse(output) as { email: string; password: string };
}
async function apiClient(credentials: ReturnType<typeof account>) {
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { logger: false });
  const result = await client.action(api.auth.signIn, { provider: "password", params: { flow: "signIn", ...credentials } });
  if (!result.tokens) throw new Error("Expected session");
  client.setAuth(result.tokens.token);
  return client;
}
async function login(page: Page, credentials: ReturnType<typeof account>) {
  await page.goto("/sign-in");
  await page.getByLabel("Din e-postadress").fill(credentials.email);
  await page.getByLabel("Lösenord", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("20 glosor: lokal preview, tre rättelser, redigering, publicering och arkivering", async ({ page }) => {
  const credentials = account();
  const client = await apiClient(credentials);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await login(page, credentials);
  await page.getByRole("link", { name: "Skapa gloslista" }).click();
  const started = Date.now();
  await page.getByLabel("Listans rubrik").fill("Vecka 42 – tjugo glosor");
  await page.getByLabel("Provdatum (valfritt)").fill("2026-12-01");
  const source = Array.from({ length: 20 }, (_, i) => `niño ${i}${[";", " - ", "\t"][i % 3]}barn ${i}`);
  source[2] = "saknar avgränsare"; source[7] = "niño 7;"; source[12] = "niño 12;barn 12;extra";
  await page.getByLabel("Glosor", { exact: true }).fill(source.join("\n"));
  await page.getByRole("button", { name: "Förhandsgranska" }).click();
  await expect(page.getByRole("button", { name: "Importera 20 glosor", exact: true })).toBeDisabled();
  expect(await client.query(api.lists.listMine)).toEqual([]);
  await page.getByLabel("Spanska, rad 3", { exact: true }).fill("niño 2");
  await page.getByLabel("Svenska, rad 3", { exact: true }).fill("barn 2");
  await page.getByRole("button", { name: "Bekräfta korrigerad rad 3", exact: true }).click();
  await page.getByLabel("Svenska, rad 8", { exact: true }).fill("barn 7");
  await page.getByRole("button", { name: "Bekräfta korrigerad rad 13", exact: true }).click();
  expect(await client.query(api.lists.listMine)).toEqual([]);
  await page.getByRole("button", { name: "Importera 20 glosor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vecka 42 – tjugo glosor", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Utkast · 20" })).toBeVisible();
  const [list] = await client.query(api.lists.listMine);
  expect((await client.query(api.words.listForAdmin, { listId: list._id })).map((word) => [word.spanish, word.swedish])).toEqual(Array.from({ length: 20 }, (_, i) => [`niño ${i}`, `barn ${i}`]));
  const first = page.getByRole("region", { name: "Sparade glosor" }).getByRole("listitem").first();
  await first.getByRole("button", { name: "Redigera glosa" }).click();
  await first.getByLabel("Spanska", { exact: true }).fill("el niño");
  await first.getByLabel("Alternativa svar på svenska").fill("pojken\nbarnet");
  await first.getByRole("button", { name: "Spara glosa" }).click();
  await expect(first.getByText("Svenska alternativ: pojken; barnet")).toBeVisible();
  await page.getByLabel("Listans rubrik").fill("Vecka 42 – klar");
  await page.getByRole("button", { name: "Spara uppgifter" }).click();
  await expect(page.getByRole("heading", { name: "Vecka 42 – klar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publicera listan" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publicerad · 20" })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(120_000);
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await first.getByRole("button", { name: "Gör inaktiv" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publicerad · 19" })).toBeVisible();
  await page.getByLabel("Visa även inaktiva (1)").check();
  await page.getByRole("button", { name: "Återaktivera" }).click();
  await page.getByRole("button", { name: "Arkivera listan" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Arkiverad · 20" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Redigera glosa" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Återställ till utkast" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Utkast · 20" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("CSV med citat, UTF-8, dubblettval och säker textrendering på mobil", async ({ page }) => {
  const credentials = account();
  await login(page, credentials);
  await page.goto("/admin/lists/new");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByLabel("Listans rubrik").fill("CSV-lista");
  await page.getByLabel("Läs in CSV eller TSV").setInputFiles({ name: "glosor.csv", mimeType: "text/csv", buffer: Buffer.from('\uFEFFsvenska,spanska\n"hej, du",hola\n"hej, du",hola\nbarnet,niño\n"<script>window.hacked=true</script>",seguro') });
  await page.getByRole("button", { name: "Förhandsgranska" }).click();
  await expect(page.getByLabel("Spanska, rad 2", { exact: true })).toHaveValue("hola");
  await expect(page.getByLabel("Svenska, rad 2", { exact: true })).toHaveValue("hej, du");
  await expect(page.getByRole("button", { name: "Importera 4 glosor" })).toBeDisabled();
  await page.getByLabel("Behåll dubbletten på rad 3").check();
  await expect(page.getByRole("button", { name: "Importera 4 glosor" })).toBeEnabled();
  await page.getByLabel("Ta med rad 3", { exact: true }).uncheck();
  for (const control of [page.getByLabel("Listans rubrik"), page.getByRole("combobox", { name: "Format", exact: true }), page.getByLabel("Spanska, rad 2", { exact: true }), page.getByRole("button", { name: "Förhandsgranska" })]) {
    // Also detects a stale development stylesheet, which overflow/axe alone misses.
    expect((await control.boundingBox())?.height, await control.evaluate((element) => `${element.tagName}: ${getComputedStyle(element).minHeight}`)).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Importera 3 glosor" }).click();
  await expect(page.getByRole("heading", { name: "CSV-lista", exact: true })).toBeVisible();
  await expect(page.getByText("seguro — <script>window.hacked=true</script>")).toBeVisible();
  expect(await page.evaluate(() => "hacked" in window)).toBe(false);
  await page.getByText("Importera fler glosor", { exact: true }).click();
  await page.getByLabel("Glosor", { exact: true }).fill("niño;barnet\ncasa;hus");
  await page.getByRole("button", { name: "Förhandsgranska" }).click();
  await expect(page.getByRole("button", { name: "Importera 2 glosor" })).toBeDisabled();
  await page.getByLabel("Ta med rad 1", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Importera 1 glosor" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Utkast · 4" })).toBeVisible();
});

test("riktigt API: samtidiga retry har en effekt och andra familjers ID nekas", async () => {
  const client = await apiClient(account());
  const stranger = await apiClient(account());
  const source = Array.from({ length: 200 }, (_, i) => `niño ${i};barn ${i}`).join("\n");
  const args = { requestId: randomUUID(), target: { kind: "new" as const, title: "Retry" }, source, options: defaultOptions, rows: prepareRows(parseVocabulary(source)) };
  const results = await Promise.all([client.mutation(api.imports.commitPreviewImport, args), client.mutation(api.imports.commitPreviewImport, args)]);
  expect(results[0]).toEqual(results[1]);
  expect(await client.query(api.lists.listMine)).toHaveLength(1);
  const { listId } = results[0];
  expect(await client.query(api.words.listForAdmin, { listId })).toHaveLength(200);
  await expect(stranger.query(api.lists.getForAdmin, { listId })).rejects.toThrow("NOT_FOUND");
  await expect(stranger.mutation(api.lists.setStatus, { listId, status: "published" })).rejects.toThrow("NOT_FOUND");
  await expect(stranger.mutation(api.imports.commitPreviewImport, { ...args, target: { kind: "existing", listId } })).rejects.toThrow("NOT_FOUND");
  expect(await client.mutation(api.imports.commitPreviewImport, args)).toEqual(results[0]);
});
