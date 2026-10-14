import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { defaultOptions, parseVocabulary, prepareRows } from "../src/lib/vocabulary/parser";
import { LIMITS } from "../src/lib/vocabulary/validation";

const modules = import.meta.glob("../convex/**/*.ts");
const importArgs = (source = "el gato;katten", title = "Vecka 42") => ({
  requestId: crypto.randomUUID(), target: { kind: "new" as const, title }, source, options: defaultOptions, rows: prepareRows(parseVocabulary(source)),
});
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const guardianId = await ctx.db.insert("users", { role: "guardian" });
    const otherId = await ctx.db.insert("users", { role: "guardian" });
    const learnerId = await ctx.db.insert("users", { role: "learner", guardianId });
    await ctx.db.insert("learnerProfiles", { guardianId, learnerUserId: learnerId, nickname: "Testare", createdAt: Date.now() });
    const sessions = await Promise.all([guardianId, otherId, learnerId].map((userId) => ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 60_000 })));
    return { guardianId, otherId, learnerId, sessions };
  });
  return { t, ids, guardian: t.withIdentity({ subject: `${ids.guardianId}|${ids.sessions[0]}` }), other: t.withIdentity({ subject: `${ids.otherId}|${ids.sessions[1]}` }), learner: t.withIdentity({ subject: `${ids.learnerId}|${ids.sessions[2]}`, role: "guardian" }) };
}

describe("guardian lists and atomic imports", () => {
  it("imports 20 words, repeats sequentially and concurrently with one effect", async () => {
    const { guardian, t } = await fixture();
    const args = importArgs(Array.from({ length: 20 }, (_, i) => `niño ${i}${[";", " - ", "\t"][i % 3]}barn ${i}`).join("\n"));
    const result = await guardian.mutation(api.imports.commitPreviewImport, args);
    expect(result.importedCount).toBe(20);
    expect(await guardian.mutation(api.imports.commitPreviewImport, args)).toEqual(result);
    expect(await Promise.all([guardian.mutation(api.imports.commitPreviewImport, args), guardian.mutation(api.imports.commitPreviewImport, args)])).toEqual([result, result]);
    expect(await guardian.query(api.words.listForAdmin, { listId: result.listId })).toHaveLength(20);
    expect(await t.run((ctx) => ctx.db.query("importBatches").collect())).toHaveLength(1);
    expect(await guardian.query(api.lists.getForAdmin, { listId: result.listId })).toMatchObject({ status: "draft", wordCount: 20, activeWordCount: 20 });
    await expect(guardian.mutation(api.imports.commitPreviewImport, { ...args, target: { kind: "new", title: "Changed" } })).rejects.toThrow("Import-ID");
    const fresh = importArgs("la casa;huset");
    const parallel = await Promise.all([guardian.mutation(api.imports.commitPreviewImport, fresh), guardian.mutation(api.imports.commitPreviewImport, fresh)]);
    expect(parallel[0]).toEqual(parallel[1]);
    expect(await guardian.query(api.words.listForAdmin, { listId: parallel[0].listId })).toHaveLength(1);
  });
  it("creates empty draft, validates metadata, publishes and archives without deleting", async () => {
    const { guardian, learner } = await fixture();
    const listId = await guardian.mutation(api.lists.create, { title: " Empty ", testDate: "2026-12-01" });
    await expect(guardian.mutation(api.lists.setStatus, { listId, status: "published" })).rejects.toThrow("minst en");
    await expect(guardian.mutation(api.lists.update, { listId, title: "Changed", testDate: "2026-02-29" })).rejects.toThrow("provdatum");
    await guardian.mutation(api.lists.update, { listId, title: " Ny rubrik ", description: " text " });
    expect(await guardian.query(api.lists.getForAdmin, { listId })).toMatchObject({ title: "Ny rubrik", description: "text" });
    await guardian.mutation(api.imports.commitPreviewImport, { ...importArgs(), target: { kind: "existing", listId } });
    await guardian.mutation(api.lists.setStatus, { listId, status: "published" });
    const view = await learner.query(api.lists.getPublishedForLearner, { listId });
    expect(view).toEqual({ _id: listId, title: "Ny rubrik", description: "text", activeWordCount: 1 });
    await guardian.mutation(api.lists.setStatus, { listId, status: "archived" });
    expect(await learner.query(api.lists.listPublishedForLearner)).toEqual([]);
    expect(await guardian.query(api.words.listForAdmin, { listId })).toHaveLength(1);
    await expect(guardian.mutation(api.imports.commitPreviewImport, { ...importArgs("hola;hej"), target: { kind: "existing", listId } })).rejects.toThrow("Återställ");
    await guardian.mutation(api.lists.setStatus, { listId, status: "draft" });
    expect(await guardian.query(api.lists.listMine)).toHaveLength(1);
  });
  it("rejects invalid or silently dropped rows without writing any documents, then permits explicit corrections", async () => {
    const { guardian, t } = await fixture();
    const args = importArgs("el gato;katten\nbroken\nel perro;\ncasa;hus;extra");
    await expect(guardian.mutation(api.imports.commitPreviewImport, args)).rejects.toThrow("Korrigera");
    await expect(guardian.mutation(api.imports.commitPreviewImport, { ...args, rows: args.rows.slice(0, 1) })).rejects.toThrow("Alla källrader");
    expect(await guardian.query(api.lists.listMine)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("words").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("importBatches").collect())).toEqual([]);
    args.rows[1] = { ...args.rows[1], spanish: "hola", swedish: "hej", reviewed: true };
    args.rows[2].swedish = "hunden";
    args.rows[3].included = false;
    expect((await guardian.mutation(api.imports.commitPreviewImport, args)).importedCount).toBe(3);
  });
  it("requires an explicit decision for existing and source duplicates", async () => {
    const { guardian } = await fixture();
    const { listId } = await guardian.mutation(api.imports.commitPreviewImport, importArgs());
    const args = { ...importArgs("EL GATO;katten\nel perro;hunden\nel perro;hunden"), target: { kind: "existing" as const, listId } };
    await expect(guardian.mutation(api.imports.commitPreviewImport, args)).rejects.toThrow("dubbletter");
    args.rows[0].included = false; args.rows[2].keepDuplicate = true;
    expect((await guardian.mutation(api.imports.commitPreviewImport, args)).importedCount).toBe(2);
    expect(await guardian.query(api.words.listForAdmin, { listId })).toHaveLength(3);
  });
  it.each(["rows", "cell", "bytes", "empty", "payload"])("rejects oversized or empty %s at the server", async (kind) => {
    const { guardian } = await fixture();
    const args = importArgs();
    if (kind === "rows") { args.source = Array.from({ length: 201 }, (_, i) => `es${i};sv${i}`).join("\n"); args.rows = prepareRows(parseVocabulary(args.source)); }
    if (kind === "cell") args.rows[0].spanish = "a".repeat(5001);
    if (kind === "bytes") args.source = "ñ".repeat(LIMITS.importBytes / 2 + 1);
    if (kind === "empty") args.rows[0].included = false;
    if (kind === "payload") args.rows[0].spanish = "ñ".repeat(LIMITS.importBytes / 2 + 1);
    await expect(guardian.mutation(api.imports.commitPreviewImport, args)).rejects.toThrow();
    expect(await guardian.query(api.lists.listMine)).toEqual([]);
  });
  it("versions answer changes, detects stale edits and soft-deletes without losing data", async () => {
    const { guardian, learner, t } = await fixture();
    const { listId } = await guardian.mutation(api.imports.commitPreviewImport, importArgs());
    const [word] = await guardian.query(api.words.listForAdmin, { listId });
    const update = { wordId: word._id, expectedVersion: 1, spanish: word.spanish, swedish: word.swedish, acceptedSpanish: [], acceptedSwedish: [] };
    await guardian.mutation(api.words.updateWord, update);
    expect((await guardian.query(api.words.listForAdmin, { listId }))[0].contentVersion).toBe(1);
    await guardian.mutation(api.words.updateWord, { ...update, acceptedSwedish: ["katt", "katt"] });
    await expect(guardian.mutation(api.words.updateWord, update)).rejects.toThrow("annan vy");
    expect((await guardian.query(api.words.listForAdmin, { listId }))[0]).toMatchObject({ contentVersion: 2, acceptedSwedish: ["katt"] });
    await guardian.mutation(api.lists.setStatus, { listId, status: "published" });
    await guardian.mutation(api.words.setActive, { wordId: word._id, isActive: false });
    expect(await t.run((ctx) => ctx.db.get(word._id))).toMatchObject({ isActive: false, contentVersion: 2 });
    expect(await learner.query(api.lists.listPublishedForLearner)).toEqual([]);
    expect(await guardian.query(api.lists.getForAdmin, { listId })).toMatchObject({ status: "draft", activeWordCount: 0, wordCount: 1 });
    await guardian.mutation(api.words.setActive, { wordId: word._id, isActive: true });
    expect(await guardian.query(api.lists.getForAdmin, { listId })).toMatchObject({ activeWordCount: 1 });
  });
  it("enforces bounded family and list capacity atomically", async () => {
    const { guardian, t } = await fixture();
    const { listId } = await guardian.mutation(api.imports.commitPreviewImport, importArgs());
    await t.run((ctx) => ctx.db.patch(listId, { wordCount: 500 }));
    await expect(guardian.mutation(api.imports.commitPreviewImport, { ...importArgs("hola;hej"), target: { kind: "existing", listId } })).rejects.toThrow("500");
    await t.run((ctx) => ctx.db.patch(listId, { wordCount: 1, contentBytes: LIMITS.listBytes }));
    await expect(guardian.mutation(api.imports.commitPreviewImport, { ...importArgs("hola;hej"), target: { kind: "existing", listId } })).rejects.toThrow("2 MB");
    for (let i = 1; i < 50; i++) await guardian.mutation(api.lists.create, { title: `List ${i}` });
    await expect(guardian.mutation(api.imports.commitPreviewImport, importArgs())).rejects.toThrow("50");
    expect(await t.run((ctx) => ctx.db.query("words").collect())).toHaveLength(1);
  });
});

describe("family authorization matrix", () => {
  it("denies every admin operation for anonymous, learner and foreign guardian", async () => {
    const { guardian, other, learner, t } = await fixture();
    const { listId } = await guardian.mutation(api.imports.commitPreviewImport, importArgs());
    const [word] = await guardian.query(api.words.listForAdmin, { listId });
    for (const client of [t, learner, other]) {
      await expect(client.query(api.lists.getForAdmin, { listId })).rejects.toThrow();
      await expect(client.query(api.words.listForAdmin, { listId })).rejects.toThrow();
      await expect(client.mutation(api.lists.update, { listId, title: "stolen" })).rejects.toThrow();
      await expect(client.mutation(api.lists.setStatus, { listId, status: "published" })).rejects.toThrow();
      await expect(client.mutation(api.imports.commitPreviewImport, { ...importArgs(), target: { kind: "existing", listId } })).rejects.toThrow();
      await expect(client.mutation(api.words.setActive, { wordId: word._id, isActive: false })).rejects.toThrow();
      await expect(client.mutation(api.words.updateWord, { wordId: word._id, expectedVersion: 1, spanish: "x", swedish: "y", acceptedSpanish: [], acceptedSwedish: [] })).rejects.toThrow();
    }
    for (const client of [t, learner]) {
      await expect(client.query(api.lists.listMine)).rejects.toThrow();
      await expect(client.mutation(api.lists.create, { title: "stolen" })).rejects.toThrow();
      await expect(client.mutation(api.imports.commitPreviewImport, importArgs())).rejects.toThrow();
    }
    expect(await other.query(api.lists.listMine)).toEqual([]);
    expect(await guardian.query(api.lists.getForAdmin, { listId })).toMatchObject({ title: "Vecka 42", status: "draft", activeWordCount: 1 });
  });
  it("learners see only their own published metadata, with no answers", async () => {
    const { guardian, other, learner } = await fixture();
    const own = await guardian.mutation(api.imports.commitPreviewImport, importArgs());
    const foreign = await other.mutation(api.imports.commitPreviewImport, importArgs());
    await other.mutation(api.lists.setStatus, { listId: foreign.listId, status: "published" });
    for (const listId of [own.listId, foreign.listId]) await expect(learner.query(api.lists.getPublishedForLearner, { listId })).rejects.toThrow("NOT_FOUND");
    expect(await learner.query(api.lists.listPublishedForLearner)).toEqual([]);
    await guardian.mutation(api.lists.setStatus, { listId: own.listId, status: "published" });
    expect(await learner.query(api.lists.listPublishedForLearner)).toEqual([{ _id: own.listId, title: "Vecka 42", activeWordCount: 1 }]);
    await guardian.mutation(api.lists.setStatus, { listId: own.listId, status: "archived" });
    await expect(learner.query(api.lists.getPublishedForLearner, { listId: own.listId })).rejects.toThrow("NOT_FOUND");
  });
});
