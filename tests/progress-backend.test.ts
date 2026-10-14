import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { defaultOptions, parseVocabulary, prepareRows } from "../src/lib/vocabulary/parser";
import { DAY, initialProgress } from "../src/lib/practice/repetition";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.restoreAllMocks());
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

describe("word progress integration", () => {
  it("rotates retained duplicate rows without repeating the expression within a session", async () => {
    const { guardian, listId, start, question } = await fixture("rojo;röd");
    const source = "rojo;röd";
    await guardian.mutation(api.imports.commitPreviewImport, { requestId: crypto.randomUUID(), target: { kind: "existing", listId }, source, options: defaultOptions, rows: prepareRows(parseVocabulary(source)).map((row) => ({ ...row, keepDuplicate: true })) });
    const wordIds = [];
    for (let i = 0; i < 2; i++) {
      const sessionId = await guardian.mutation(api.practice.startSession, { ...start, selection: "all", requestId: crypto.randomUUID() });
      expect((await guardian.query(api.practice.getCurrentQuestion, { sessionId })).session.questionCount).toBe(1);
      wordIds.push((await question(sessionId))!.wordId);
      await guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "rojo" } });
      await guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 });
      if (i === 0) {
        const difficult = await guardian.mutation(api.practice.startSession, { ...start, selection: "difficult", requestId: crypto.randomUUID() });
        expect((await question(difficult))!.wordId).toBe(wordIds[0]);
        await guardian.mutation(api.practice.abandonSession, { sessionId: difficult });
      }
    }
    expect(new Set(wordIds).size).toBe(2);
    expect((await guardian.query(api.progress.myOverview, { listId })).words.every((word) => word.attempts === 1)).toBe(true);
  });
  it("requires three genuine multiple-choice exposures per promotion", async () => {
    const { guardian, listId, start, question } = await fixture();
    for (let i = 1; i <= 3; i++) {
      const sessionId = await guardian.mutation(api.practice.startSession, { ...start, mode: "multiple_choice", requestId: crypto.randomUUID() });
      for (let index = 0; index < 3; index++) {
        const q = (await question(sessionId, index))!;
        expect(q.mode).toBe("multiple_choice");
        await guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: index, submission: { kind: "multiple_choice", optionId: q.correctOptionId! } });
        await guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: index });
      }
      const report = await guardian.query(api.progress.myOverview, { listId });
      expect(report.words.every((word) => word.masteryLevel === (i === 3 ? 1 : 0) && word.correct === i)).toBe(true);
    }
  });
  it("a concurrent edit and old answer cannot leave progress on the old version", async () => {
    const { guardian, listId, start } = await fixture("rojo;röd");
    const sessionId = await guardian.mutation(api.practice.startSession, start);
    const [word] = await guardian.query(api.words.listForAdmin, { listId });
    await Promise.all([
      guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "rojo" } }),
      guardian.mutation(api.words.updateWord, { wordId: word._id, expectedVersion: 1, spanish: "roja", swedish: "röd", acceptedSpanish: [], acceptedSwedish: [] }),
    ]);
    expect((await guardian.query(api.progress.myOverview, { listId })).words[0]).toMatchObject({ contentVersion: 2, attempts: 0, masteryLevel: 0 });
    await guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 });
    expect((await guardian.query(api.practice.getResults, { sessionId })).correctCount).toBe(1);
  });
  it("saves progress once with the first accepted answer, even with parallel retry", async () => {
    const { t, guardian, listId, start, question } = await fixture();
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    const sessionId = await guardian.mutation(api.practice.startSession, start);
    const q = (await question(sessionId))!;
    const args = { sessionId, questionIndex: 0, submission: { kind: "written" as const, text: q.correctAnswer } };
    await Promise.all([guardian.mutation(api.practice.submitAnswer, args), guardian.mutation(api.practice.submitAnswer, args)]);
    const progress = await t.run((ctx) => ctx.db.query("wordProgress").collect());
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ attempts: 1, correct: 1, masteryLevel: 0, nextReviewAt: now + DAY, lastReviewedAt: now });
    await guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 });
    await guardian.mutation(api.practice.submitAnswer, args);
    expect((await guardian.query(api.progress.myOverview, { listId })).words.find((word) => word.wordId === q.wordId)?.attempts).toBe(1);
    // Client-controlled clock, level, and family IDs are never accepted.
    // @ts-expect-error malicious extra arguments
    await expect(guardian.mutation(api.practice.submitAnswer, { ...args, now: 0, masteryLevel: 3 })).rejects.toThrow();
  });
  it("promotes on two distinct written answers across directions and lowers on failure", async () => {
    const { guardian, listId, start, question } = await fixture("rojo;röd");
    for (let i = 0; i < 3; i++) {
      const sessionId = await guardian.mutation(api.practice.startSession, { ...start, requestId: crypto.randomUUID(), direction: i === 1 ? "es_to_sv" : "sv_to_es" });
      const q = (await question(sessionId))!;
      await guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: i === 2 ? "wrong" : q.correctAnswer } });
      await guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 });
      expect((await guardian.query(api.progress.myOverview, { listId })).words[0].masteryLevel).toBe(i === 1 ? 1 : 0);
    }
    const report = await guardian.query(api.progress.guardianLearnerOverview, { listId });
    expect(report.words[0]).toMatchObject({ correct: 2, wrong: 1, attempts: 3, consecutiveCorrect: 0, lastSuccessful: false });
    expect(report.latestSession).toMatchObject({ objective: 1, correct: 0 });
  });
  it("counts actual question mode after multiple-choice fallback and separates self-assessment", async () => {
    const { guardian, listId, start, question } = await fixture("rojo;röd");
    const sessionId = await guardian.mutation(api.practice.startSession, { ...start, mode: "multiple_choice" });
    expect((await question(sessionId))?.mode).toBe("written");
    await guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "rojo" } });
    await guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 });
    expect((await guardian.query(api.progress.myOverview, { listId })).words[0].promotionPoints).toBe(3);
    const flash = await guardian.mutation(api.practice.startSession, { ...start, requestId: crypto.randomUUID(), mode: "flashcard" });
    await guardian.mutation(api.practice.revealFlashcard, { sessionId: flash, questionIndex: 0 });
    await guardian.mutation(api.practice.submitAnswer, { sessionId: flash, questionIndex: 0, submission: { kind: "flashcard", rating: "again" } });
    await guardian.mutation(api.practice.advanceQuestion, { sessionId: flash, questionIndex: 0 });
    const report = await guardian.query(api.progress.myOverview, { listId });
    expect(report.words[0]).toMatchObject({ attempts: 2, correct: 1, wrong: 0, selfAgain: 1, promotionPoints: 0 });
    expect(report.latestSession).toMatchObject({ objective: 0, correct: 0, selfAssessed: 1, selfKnown: 0 });
  });
  it("keeps state for unchanged text, resets edited versions, and never credits old snapshots", async () => {
    const { t, guardian, listId, start } = await fixture("rojo;röd");
    const [word] = await guardian.query(api.words.listForAdmin, { listId });
    const old = await guardian.mutation(api.practice.startSession, start);
    const args = { sessionId: old, questionIndex: 0, submission: { kind: "written" as const, text: "rojo" } };
    await guardian.mutation(api.practice.submitAnswer, args);
    await guardian.mutation(api.practice.advanceQuestion, { sessionId: old, questionIndex: 0 });
    const edit = { wordId: word._id, expectedVersion: 1, spanish: word.spanish, swedish: word.swedish, acceptedSpanish: [], acceptedSwedish: [] };
    await guardian.mutation(api.words.updateWord, edit);
    expect((await guardian.query(api.progress.myOverview, { listId })).words[0].attempts).toBe(1);
    const stale = await guardian.mutation(api.practice.startSession, { ...start, requestId: crypto.randomUUID() });
    await guardian.mutation(api.words.updateWord, { ...edit, acceptedSpanish: ["color rojo"] });
    let progress = (await guardian.query(api.progress.myOverview, { listId })).words[0];
    expect(progress).toMatchObject({ contentVersion: 2, attempts: 0, masteryLevel: 0 });
    expect(progress.lastReviewedAt).toBeUndefined();
    await guardian.mutation(api.practice.submitAnswer, { ...args, sessionId: stale });
    await guardian.mutation(api.practice.submitAnswer, args);
    progress = (await guardian.query(api.progress.myOverview, { listId })).words[0];
    expect(progress.attempts).toBe(0);
    expect((await guardian.query(api.practice.getResults, { sessionId: old })).answers[0].feedback.correctAnswer).toBe("rojo");
    expect(await t.run((ctx) => ctx.db.query("practiceAnswers").collect())).toHaveLength(2);
  });
  it("excludes inactive words and unpublished lists from learning without erasing history", async () => {
    const { guardian, listId, start } = await fixture("rojo;röd");
    const sessionId = await guardian.mutation(api.practice.startSession, start);
    await guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "rojo" } });
    const [word] = await guardian.query(api.words.listForAdmin, { listId });
    await guardian.mutation(api.words.setActive, { wordId: word._id, isActive: false });
    expect((await guardian.query(api.progress.guardianLearnerOverview, { listId })).words).toHaveLength(0);
    await expect(guardian.query(api.progress.myOverview, { listId })).rejects.toThrow();
    await guardian.mutation(api.words.setActive, { wordId: word._id, isActive: true });
    expect((await guardian.query(api.progress.guardianLearnerOverview, { listId })).words[0].attempts).toBe(1);
    await guardian.mutation(api.lists.setStatus, { listId, status: "archived" });
    expect((await guardian.query(api.progress.guardianLearnerOverview, { listId })).status).toBe("archived");
    await expect(guardian.query(api.progress.myOverview, { listId })).rejects.toThrow();
  });
  it("handles empty difficult selection, uses full distractor pool, and includes selection in retry identity", async () => {
    const { guardian, start, question } = await fixture();
    await expect(guardian.mutation(api.practice.startSession, { ...start, selection: "difficult" })).rejects.toThrow("Inga svåra");
    const first = await guardian.mutation(api.practice.startSession, start);
    await guardian.mutation(api.practice.submitAnswer, { sessionId: first, questionIndex: 0, submission: { kind: "written", text: "wrong" } });
    const q = (await question(first))!;
    await guardian.mutation(api.practice.abandonSession, { sessionId: first });
    const args = { ...start, mode: "multiple_choice" as const, selection: "difficult" as const, requestId: crypto.randomUUID() };
    const sessionId = await guardian.mutation(api.practice.startSession, args);
    expect((await question(sessionId))).toMatchObject({ wordId: q.wordId, mode: "multiple_choice" });
    const view = await guardian.query(api.practice.getCurrentQuestion, { sessionId });
    expect(view.session.questionCount).toBe(1);
    await expect(guardian.mutation(api.practice.startSession, { ...args, selection: "all" })).rejects.toThrow("andra val");
    expect(await guardian.mutation(api.practice.startSession, args)).toBe(sessionId);
  });
  it("uses server time to choose six due words and four new words without a cron", async () => {
    const { t, guardian, profileId, listId, start } = await fixture(Array.from({ length: 16 }, (_, i) => `es${i};sv${i}`).join("\n"));
    const now = Date.now();
    const words = await guardian.query(api.words.listForAdmin, { listId });
    await t.run(async (ctx) => {
      for (const word of words.slice(0, 8)) await ctx.db.insert("wordProgress", {
        ...initialProgress(now), masteryLevel: 1, attempts: 2, correct: 2, contentVersion: 1, profileId, listId, wordId: word._id,
        nextReviewAt: now + DAY, lastSuccessful: true,
      });
    });
    vi.spyOn(Date, "now").mockReturnValue(now + 2 * DAY);
    const sessionId = await guardian.mutation(api.practice.startSession, { ...start, count: 10 });
    const questions = await t.run((ctx) => ctx.db.query("practiceQuestions").withIndex("by_session_question", (q) => q.eq("sessionId", sessionId)).collect());
    const reviewed = new Set(words.slice(0, 8).map((word) => word._id));
    expect(questions.filter((q) => reviewed.has(q.wordId))).toHaveLength(6);
    expect(new Set(questions.map((q) => q.wordId)).size).toBe(10);
  });
  it("isolates reports by family, role and active auth session and omits aliases from views", async () => {
    const { t, guardian, other, learner, ids, listId } = await fixture();
    for (const client of [t, other, learner]) {
      await expect(client.query(api.progress.myOverview, { listId })).rejects.toThrow();
      await expect(client.query(api.progress.guardianLearnerOverview, { listId })).rejects.toThrow();
    }
    const view = await guardian.query(api.progress.myOverview, { listId });
    expect(view.words[0].spanish).toBeUndefined();
    expect(JSON.stringify(view)).not.toMatch(/acceptedSpanish|acceptedSwedish|correctOptionId|guardianId|profileId/);
    await t.run((ctx) => ctx.db.delete(ids.sessions[0]));
    await expect(guardian.query(api.progress.myOverview, { listId })).rejects.toThrow("UNAUTHENTICATED");
    await expect(guardian.query(api.progress.guardianLearnerOverview, { listId })).rejects.toThrow("UNAUTHENTICATED");
  });
  it("retains completed-session statistics even after editing words; abandoned passes do not replace them", async () => {
    const { guardian, listId, start } = await fixture("rojo;röd");
    const sessionId = await guardian.mutation(api.practice.startSession, start);
    await guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "rojo" } });
    await guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 });
    const second = await guardian.mutation(api.practice.startSession, { ...start, requestId: crypto.randomUUID() });
    await guardian.mutation(api.practice.abandonSession, { sessionId: second });
    const [word] = await guardian.query(api.words.listForAdmin, { listId });
    await guardian.mutation(api.words.updateWord, { wordId: word._id, expectedVersion: 1, spanish: "roja", swedish: "röd", acceptedSpanish: [], acceptedSwedish: [] });
    const report = await guardian.query(api.progress.guardianLearnerOverview, { listId });
    expect(report.latestSession).toMatchObject({ sessionId, correct: 1, objective: 1 });
    expect(report.words[0]).toMatchObject({ attempts: 0, contentVersion: 2 });
  });
});
