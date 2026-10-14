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

async function complete(f: Awaited<ReturnType<typeof fixture>>, sessionId: Id<"practiceSessions">, correctCount = 10) {
  const { guardian, question } = f;
  const count = (await guardian.query(api.practice.getCurrentQuestion, { sessionId })).session.questionCount;
  for (let index = 0; index < count; index++) {
    const q = (await question(sessionId, index))!;
    if (q.mode === "flashcard") await guardian.mutation(api.practice.revealFlashcard, { sessionId, questionIndex: index });
    const success = index < correctCount;
    await guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: index, submission: q.mode === "written"
      ? { kind: "written", text: success ? q.correctAnswer : "fel" }
      : q.mode === "multiple_choice" ? { kind: "multiple_choice", optionId: success ? q.correctOptionId! : q.options!.find((option) => option.id !== q.correctOptionId)!.id }
      : { kind: "flashcard", rating: success ? "known" : "again" } });
    await guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: index });
  }
  return guardian.query(api.practice.getResults, { sessionId });
}
const tenWords = Array.from({ length: 10 }, (_, i) => `es${i};sv${i}`).join("\n");

describe("server rewards and challenge", () => {
  it.each([["written", 10], ["multiple_choice", 6], ["flashcard", 2]] as const)("awards %s XP only for successful answers and separates self assessment", async (mode, xp) => {
    const f = await fixture();
    const sessionId = await f.guardian.mutation(api.practice.startSession, { ...f.start, mode });
    const result = await complete(f, sessionId, 2);
    expect(result.xpEarned).toBe(2 * xp);
    expect(result.answers.map((answer) => answer.feedback.xpAwarded)).toEqual([xp, xp, 0]);
    expect((await f.guardian.query(api.rewards.mine, {}))!).toMatchObject({ totalXp: 2 * xp, correctWrittenCount: mode === "written" ? 2 : 0 });
    if (mode === "flashcard") expect(result.objectiveCount).toBe(0);
  });
  it("uses actual written mode after a short-list fallback", async () => {
    const f = await fixture("rojo;röd");
    const sessionId = await f.guardian.mutation(api.practice.startSession, { ...f.start, mode: "multiple_choice" });
    expect((await complete(f, sessionId)).xpEarned).toBe(10);
    expect((await f.guardian.query(api.rewards.mine, {}))?.correctWrittenCount).toBe(1);
  });
  it("parallel identical answers/completions and replay preserve XP, original feedback and a single badge", async () => {
    const f = await fixture("rojo;röd");
    const sessionId = await f.guardian.mutation(api.practice.startSession, f.start);
    const args = { sessionId, questionIndex: 0, submission: { kind: "written" as const, text: "rojo" } };
    const [first, retry] = await Promise.all([f.guardian.mutation(api.practice.submitAnswer, args), f.guardian.mutation(api.practice.submitAnswer, args)]);
    expect(first).toEqual(retry);
    await Promise.all([f.guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 }), f.guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 })]);
    await f.guardian.mutation(api.practice.submitAnswer, args);
    await f.guardian.mutation(api.practice.startSession, f.start);
    await expect(f.guardian.mutation(api.practice.submitAnswer, { ...args, submission: { kind: "written", text: "azul" } })).rejects.toThrow("redan besvarad");
    const rewards = (await f.guardian.query(api.rewards.mine, {}))!;
    expect(rewards.totalXp).toBe(10);
    expect(rewards.correctWrittenCount).toBe(1);
    expect(rewards.badges.map((badge) => badge.code)).toEqual(["first_session"]);
    expect((await f.guardian.query(api.practice.getResults, { sessionId })).xpEarned).toBe(10);
  });
  it("does not award for invalid, spoofed or out-of-order answers", async () => {
    const f = await fixture();
    const sessionId = await f.guardian.mutation(api.practice.startSession, f.start);
    await expect(f.guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 1, submission: { kind: "written", text: "rojo" } })).rejects.toThrow();
    await expect(f.guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "multiple_choice", optionId: "choice-0" } })).rejects.toThrow();
    // @ts-expect-error client cannot award XP or supply family identity
    await expect(f.guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "rojo" }, xpAwarded: 1000, profileId: f.profileId })).rejects.toThrow();
    expect((await f.guardian.query(api.rewards.mine, {}))!.totalXp).toBe(0);
  });
  it("earns the tenth-written badge across passes exactly once; new questions can earn XP", async () => {
    const f = await fixture(tenWords);
    for (let pass = 0; pass < 3; pass++) {
      const sessionId = await f.guardian.mutation(api.practice.startSession, { ...f.start, requestId: crypto.randomUUID() });
      await complete(f, sessionId);
      const rewards = (await f.guardian.query(api.rewards.mine, {}))!;
      expect(rewards.totalXp).toBe((pass + 1) * 50);
      expect(rewards.badges.filter((badge) => badge.code === "ten_written")).toHaveLength(pass === 0 ? 0 : 1);
    }
    expect(await f.t.run((ctx) => ctx.db.query("achievements").collect())).toHaveLength(2);
  });
  it.each([7, 8])("requires the exact 80 percent boundary: %s/10", async (correct) => {
    const f = await fixture(tenWords);
    const args = { ...f.start, mode: "mixed_boss" as const, selection: "all" as const, count: 10 as const };
    const sessionId = await f.guardian.mutation(api.practice.startSession, args);
    const questions = await f.t.run((ctx) => ctx.db.query("practiceQuestions").withIndex("by_session_question", (q) => q.eq("sessionId", sessionId)).collect());
    expect(questions.filter((q) => q.mode === "written")).toHaveLength(5);
    expect(questions.filter((q) => q.mode === "multiple_choice")).toHaveLength(5);
    const publicView = await f.guardian.query(api.practice.getCurrentQuestion, { sessionId });
    expect(JSON.stringify(publicView)).not.toMatch(/correctAnswer|correctOptionId|acceptedAnswers/);
    const result = await complete(f, sessionId, correct);
    expect(result.challengePassed).toBe(correct === 8);
    expect((await f.guardian.query(api.rewards.mine, {}))!.badges.some((b) => b.code === "weekly_challenge")).toBe(correct === 8);
    await f.guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 9 });
    const again = await f.guardian.mutation(api.practice.startSession, { ...args, requestId: crypto.randomUUID() });
    await complete(f, again);
    expect((await f.guardian.query(api.rewards.mine, {}))!.badges.filter((b) => b.code === "weekly_challenge")).toHaveLength(1);
  });
  it("does not grant completion badges for abandoning a fully answered question", async () => {
    const f = await fixture("rojo;röd");
    const sessionId = await f.guardian.mutation(api.practice.startSession, { ...f.start, mode: "mixed_boss", count: 10, selection: "all" });
    await f.guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "rojo" } });
    await f.guardian.mutation(api.practice.abandonSession, { sessionId });
    const result = await f.guardian.query(api.practice.getResults, { sessionId });
    expect(result).toMatchObject({ xpEarned: 10, challengePassed: false });
    expect((await f.guardian.query(api.rewards.mine, {}))!.badges).toHaveLength(0);
  });
  it("requires full-list challenge settings and preserves request-id semantics", async () => {
    const f = await fixture();
    await expect(f.guardian.mutation(api.practice.startSession, { ...f.start, mode: "mixed_boss" })).rejects.toThrow("hela listan");
    const sessionId = await f.guardian.mutation(api.practice.startSession, { ...f.start, mode: "mixed_boss", count: 10, selection: "all" });
    expect((await f.guardian.query(api.practice.getCurrentQuestion, { sessionId })).session.questionCount).toBe(3);
    await expect(f.guardian.mutation(api.practice.startSession, { ...f.start, count: 10, selection: "all" })).rejects.toThrow("andra val");
  });
  it("isolates rewards by family and rejects anonymous, learner and revoked sessions", async () => {
    const f = await fixture("rojo;röd");
    const sessionId = await f.guardian.mutation(api.practice.startSession, f.start);
    await complete(f, sessionId);
    expect((await f.other.query(api.rewards.mine, {}))!).toMatchObject({ totalXp: 0, badges: [] });
    await expect(f.other.query(api.practice.getResults, { sessionId })).rejects.toThrow("NOT_FOUND");
    await expect(f.other.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "rojo" } })).rejects.toThrow("NOT_FOUND");
    await expect(f.t.query(api.rewards.mine, {})).rejects.toThrow("UNAUTHENTICATED");
    await expect(f.learner.query(api.rewards.mine, {})).rejects.toThrow();
    await f.t.run((ctx) => ctx.db.delete(f.ids.sessions[0]));
    await expect(f.guardian.query(api.rewards.mine, {})).rejects.toThrow("UNAUTHENTICATED");
  });
  it("reads legacy rows as zero XP and never backfills on answer retry", async () => {
    const f = await fixture("rojo;röd");
    const sessionId = await f.guardian.mutation(api.practice.startSession, f.start);
    await complete(f, sessionId);
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.profileId, { totalXp: undefined, correctWrittenCount: undefined });
      await ctx.db.patch(sessionId, { xpEarned: undefined });
      const answer = (await ctx.db.query("practiceAnswers").withIndex("by_session_question", (q) => q.eq("sessionId", sessionId)).first())!;
      const { xpAwarded: _xp, ...feedback } = answer.feedback;
      void _xp;
      await ctx.db.patch(answer._id, { feedback });
    });
    expect((await f.guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "rojo" } })).xpAwarded).toBeUndefined();
    expect((await f.guardian.query(api.rewards.mine, {}))!.totalXp).toBe(0);
    expect((await f.guardian.query(api.practice.getResults, { sessionId })).xpEarned).toBe(0);
  });
  it("preserves earned rewards and results when a list is edited or archived", async () => {
    const f = await fixture("rojo;röd");
    const sessionId = await f.guardian.mutation(api.practice.startSession, f.start);
    await complete(f, sessionId);
    const word = (await f.guardian.query(api.words.listForAdmin, { listId: f.listId }))[0];
    await f.guardian.mutation(api.words.updateWord, { wordId: word._id, expectedVersion: 1, spanish: "roja", swedish: "röd", acceptedSpanish: [], acceptedSwedish: [] });
    await f.guardian.mutation(api.lists.setStatus, { listId: f.listId, status: "archived" });
    expect((await f.guardian.query(api.practice.getResults, { sessionId }))).toMatchObject({ xpEarned: 10, listAvailable: false });
    expect((await f.guardian.query(api.rewards.mine, {}))!.totalXp).toBe(10);
  });
});
