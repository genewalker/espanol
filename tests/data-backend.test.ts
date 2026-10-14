import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { defaultOptions, parseVocabulary, prepareRows } from "../src/lib/vocabulary/parser";
import { DAY } from "../src/lib/practice/repetition";

const modules = import.meta.glob("../convex/**/*.ts");
async function fixture(source = "rojo;röd\nazul;blå\nverde;grön") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const guardianId = await ctx.db.insert("users", { role: "guardian" });
    const otherId = await ctx.db.insert("users", { role: "guardian" });
    const learnerId = await ctx.db.insert("users", { role: "learner", guardianId });
    const sessions = await Promise.all([guardianId, otherId, learnerId].map((userId) => ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 30 * DAY })));
    return { guardianId, otherId, learnerId, sessions };
  });
  const guardian = t.withIdentity({ subject: `${ids.guardianId}|${ids.sessions[0]}` });
  const other = t.withIdentity({ subject: `${ids.otherId}|${ids.sessions[1]}` });
  const learner = t.withIdentity({ subject: `${ids.learnerId}|${ids.sessions[2]}`, role: "guardian" });
  const profileId = await guardian.mutation(api.practice.saveProfile, { nickname: "Testare" });
  await other.mutation(api.practice.saveProfile, { nickname: "Annan" });
  const { listId } = await guardian.mutation(api.imports.commitPreviewImport, { requestId: crypto.randomUUID(), target: { kind: "new", title: "Färger" }, source, options: defaultOptions, rows: prepareRows(parseVocabulary(source)) });
  await guardian.mutation(api.lists.setStatus, { listId, status: "published" });
  const start = { listId, mode: "written" as const, direction: "sv_to_es" as const, count: 5 as const, requestId: crypto.randomUUID() };
  const question = (sessionId: Id<"practiceSessions">, index = 0) => t.run((ctx) => ctx.db.query("practiceQuestions").withIndex("by_session_question", (q) => q.eq("sessionId", sessionId).eq("questionIndex", index)).unique());
  return { t, guardian, other, learner, ids, listId, profileId, start, question };
}

async function answered(f: Awaited<ReturnType<typeof fixture>>) {
  const sessionId = await f.guardian.mutation(api.practice.startSession, f.start);
  const q = (await f.question(sessionId))!;
  await f.guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: q.correctAnswer } });
  return sessionId;
}
async function remove(f: Awaited<ReturnType<typeof fixture>>) {
  for (let i = 0; i < 20; i++) if ((await f.guardian.mutation(api.data.deleteProfileBatch, { profileId: f.profileId })).done) return;
  throw new Error("Deletion did not finish");
}
describe("family data lifecycle", () => {
  it("exports inactive and active words with aliases, current progress and XP but no auth or question plans", async () => {
    const f = await fixture();
    await answered(f);
    const words = await f.guardian.query(api.words.listForAdmin, { listId: f.listId });
    await f.t.run((ctx) => ctx.db.patch(words[1]._id, { isActive: false, acceptedSpanish: ["alternativo"] }));
    const data = await f.guardian.query(api.data.exportList, { listId: f.listId });
    expect(data.words).toHaveLength(3);
    expect(data.words.some((word) => !word.isActive && word.acceptedSpanish[0] === "alternativo")).toBe(true);
    expect(data.words.reduce((sum, word) => sum + word.progress.attempts, 0)).toBe(1);
    expect(data.profile).toMatchObject({ nickname: "Testare", totalXp: 10 });
    expect(JSON.stringify(data)).not.toMatch(/guardianId|profileId|correctOptionId|JWT|authSession|password|email/);
    await f.guardian.mutation(api.lists.setStatus, { listId: f.listId, status: "archived" });
    expect((await f.guardian.query(api.data.exportList, { listId: f.listId })).list.status).toBe("archived");
  });
  it("exports lists without a profile and resets exported progress after word editing", async () => {
    const f = await fixture("rojo;röd");
    await answered(f);
    const word = (await f.guardian.query(api.words.listForAdmin, { listId: f.listId }))[0];
    await f.guardian.mutation(api.words.updateWord, { wordId: word._id, expectedVersion: 1, spanish: "roja", swedish: "röd", acceptedSpanish: [], acceptedSwedish: [] });
    expect((await f.guardian.query(api.data.exportList, { listId: f.listId })).words[0].progress.attempts).toBe(0);
    await f.guardian.mutation(api.data.beginProfileDeletion, { profileId: f.profileId, confirmation: "RADERA" });
    await remove(f);
    const data = await f.guardian.query(api.data.exportList, { listId: f.listId });
    expect(data.profile).toBeNull();
    expect(data.words).toHaveLength(1);
  });
  it("rejects anonymous, forged learner and foreign-family export/deletion", async () => {
    const f = await fixture();
    for (const client of [f.t, f.learner, f.other]) {
      await expect(client.query(api.data.exportList, { listId: f.listId })).rejects.toThrow();
      await expect(client.mutation(api.data.beginProfileDeletion, { profileId: f.profileId, confirmation: "RADERA" })).rejects.toThrow();
      await expect(client.mutation(api.data.deleteProfileBatch, { profileId: f.profileId })).rejects.toThrow();
    }
    await f.t.run((ctx) => ctx.db.delete(f.ids.sessions[0]));
    await expect(f.guardian.query(api.data.profile, {})).rejects.toThrow("UNAUTHENTICATED");
  });
  it("requires explicit confirmation and prevents deleting without the lock", async () => {
    const f = await fixture();
    await expect(f.guardian.mutation(api.data.beginProfileDeletion, { profileId: f.profileId, confirmation: "" })).rejects.toThrow("RADERA");
    await expect(f.guardian.mutation(api.data.deleteProfileBatch, { profileId: f.profileId })).rejects.toThrow("Bekräfta");
    expect((await f.guardian.query(api.data.profile, {}))?.deleting).toBe(false);
  });
  it("deletes answers, questions, sessions, progress, XP and badges but preserves lists and other families", async () => {
    const f = await fixture("rojo;röd");
    const sessionId = await answered(f);
    await f.guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 });
    const other = await f.other.query(api.data.profile, {});
    await f.guardian.mutation(api.data.beginProfileDeletion, { profileId: f.profileId, confirmation: "RADERA" });
    await remove(f);
    for (const table of ["practiceAnswers", "practiceQuestions", "practiceSessions", "wordProgress", "achievements"] as const) {
      expect(await f.t.run((ctx) => ctx.db.query(table).collect())).toEqual([]);
    }
    expect(await f.guardian.query(api.data.profile, {})).toBeNull();
    expect(await f.other.query(api.data.profile, {})).toEqual(other);
    expect(await f.guardian.query(api.words.listForAdmin, { listId: f.listId })).toHaveLength(1);
    expect(await f.guardian.query(api.users.guardianViewer, {})).toBeTruthy();
  });
  it("locks practice and profile changes, resumes deletion and ignores retries against an old profile", async () => {
    const f = await fixture();
    const sessionId = await answered(f);
    await f.guardian.mutation(api.data.beginProfileDeletion, { profileId: f.profileId, confirmation: "RADERA" });
    await expect(f.guardian.mutation(api.practice.startSession, { ...f.start, requestId: crypto.randomUUID() })).rejects.toThrow("raderas");
    await expect(f.guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "rojo" } })).rejects.toThrow("raderas");
    await expect(f.guardian.mutation(api.practice.saveProfile, { nickname: "Ny" })).rejects.toThrow("raderingen");
    await expect(f.guardian.query(api.data.exportList, { listId: f.listId })).rejects.toThrow("raderas");
    expect(await f.guardian.mutation(api.data.deleteProfileBatch, { profileId: f.profileId })).toEqual({ done: false });
    expect((await f.guardian.query(api.data.profile, {}))?.deleting).toBe(true);
    await remove(f);
    const newId = await f.guardian.mutation(api.practice.saveProfile, { nickname: "Ny" });
    expect(await f.guardian.mutation(api.data.deleteProfileBatch, { profileId: f.profileId })).toEqual({ done: true });
    expect((await f.guardian.query(api.data.profile, {}))?.profileId).toBe(newId);
  });
  it("parallel answer/deletion cannot recreate orphaned progress", async () => {
    const f = await fixture("rojo;röd");
    const sessionId = await f.guardian.mutation(api.practice.startSession, f.start);
    await Promise.allSettled([
      f.guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "rojo" } }),
      f.guardian.mutation(api.data.beginProfileDeletion, { profileId: f.profileId, confirmation: "RADERA" }),
    ]);
    await Promise.all([remove(f), remove(f)]);
    expect(await f.t.run((ctx) => ctx.db.query("wordProgress").collect())).toEqual([]);
    expect(await f.t.run((ctx) => ctx.db.query("practiceAnswers").collect())).toEqual([]);
    expect(await f.guardian.query(api.data.profile, {})).toBeNull();
  });
  it("limits progress deletion to 100 rows per batch", async () => {
    const f = await fixture("rojo;röd");
    const sessionId = await answered(f);
    await f.t.run(async (ctx) => {
      const template = (await ctx.db.query("wordProgress").first())!;
      const { _id, _creationTime, ...fields } = template;
      void _id; void _creationTime;
      for (let i = 0; i < 104; i++) await ctx.db.insert("wordProgress", fields);
    });
    await f.guardian.mutation(api.data.beginProfileDeletion, { profileId: f.profileId, confirmation: "RADERA" });
    await f.guardian.mutation(api.data.deleteProfileBatch, { profileId: f.profileId });
    expect(await f.t.run((ctx) => ctx.db.get(sessionId))).toBeNull();
    await f.guardian.mutation(api.data.deleteProfileBatch, { profileId: f.profileId });
    expect(await f.t.run((ctx) => ctx.db.query("wordProgress").collect())).toHaveLength(5);
    await remove(f);
  });
});
