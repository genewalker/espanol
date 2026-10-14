import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { defaultOptions, parseVocabulary, prepareRows } from "../src/lib/vocabulary/parser";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");
async function fixture(source = "rojo;röd\nazul;blå\nverde;grön\namarillo;gul\nrosa;rosa\nnegro;svart") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const guardianId = await ctx.db.insert("users", { role: "guardian" });
    const otherId = await ctx.db.insert("users", { role: "guardian" });
    const learnerId = await ctx.db.insert("users", { role: "learner", guardianId });
    const sessions = await Promise.all([guardianId, otherId, learnerId].map((userId) => ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 600_000 })));
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
  return { t, guardian, other, learner, ids, profileId, listId, start, question };
}

describe("supervised profile and practice lifecycle", () => {
  it("creates one profile transactionally without creating an auth identity", async () => {
    const { t, guardian, profileId } = await fixture();
    const ids = await Promise.all([guardian.mutation(api.practice.saveProfile, { nickname: "Alias" }), guardian.mutation(api.practice.saveProfile, { nickname: "Alias" })]);
    expect(ids).toEqual([profileId, profileId]);
    expect(await t.run((ctx) => ctx.db.query("authAccounts").collect())).toEqual([]);
    expect((await guardian.query(api.practice.home)).nickname).toBe("Alias");
    await expect(guardian.mutation(api.practice.saveProfile, { nickname: " " })).rejects.toThrow();
  });
  it("starts once on parallel retry, permits only one active session, and rejects changed requests", async () => {
    const { guardian, start, t } = await fixture();
    const sessions = await Promise.all([guardian.mutation(api.practice.startSession, start), guardian.mutation(api.practice.startSession, start)]);
    expect(sessions[0]).toBe(sessions[1]);
    expect(await t.run((ctx) => ctx.db.query("practiceQuestions").collect())).toHaveLength(5);
    await expect(guardian.mutation(api.practice.startSession, { ...start, count: 10 })).rejects.toThrow("andra val");
    await expect(guardian.mutation(api.practice.startSession, { ...start, requestId: crypto.randomUUID() })).rejects.toThrow("pågår redan");
    expect((await guardian.query(api.practice.home)).active?.sessionId).toBe(sessions[0]);
  });
  it("does not expose hidden answers, aliases, future questions or option keys", async () => {
    const { guardian, start } = await fixture("secreto uno;fråga ett\nsecreto dos;fråga två\nsecreto tres;fråga tre");
    const sessionId = await guardian.mutation(api.practice.startSession, start);
    const view = await guardian.query(api.practice.getCurrentQuestion, { sessionId });
    const serialized = JSON.stringify(view);
    for (const privateValue of ["secreto", "acceptedAnswers", "correctAnswer", "correctOptionId", "wordId", "questionPlan"]) expect(serialized).not.toContain(privateValue);
    expect(view.state).toBe("question");
    await expect(guardian.query(api.practice.getResults, { sessionId })).rejects.toThrow("Avsluta passet");
    await expect(guardian.mutation(api.practice.revealFlashcard, { sessionId, questionIndex: 0 })).rejects.toThrow("Bara flashcards");
  });
  it("saves one answer on simultaneous identical submissions, persists feedback, and advances once", async () => {
    const { guardian, start, t, question } = await fixture();
    const sessionId = await guardian.mutation(api.practice.startSession, start);
    const expected = (await question(sessionId))!.correctAnswer;
    const args = { sessionId, questionIndex: 0, submission: { kind: "written" as const, text: expected } };
    const feedback = await Promise.all([guardian.mutation(api.practice.submitAnswer, args), guardian.mutation(api.practice.submitAnswer, args)]);
    expect(feedback[0]).toEqual(feedback[1]); expect(feedback[0].isCorrect).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("practiceAnswers").collect())).toHaveLength(1);
    const refreshed = await guardian.query(api.practice.getCurrentQuestion, { sessionId });
    expect(refreshed.state === "question" && refreshed.feedback).toEqual(feedback[0]);
    await expect(guardian.mutation(api.practice.submitAnswer, { ...args, submission: { kind: "written", text: "changed" } })).rejects.toThrow("redan besvarad");
    await Promise.all([guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 }), guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 })]);
    const next = await guardian.query(api.practice.getCurrentQuestion, { sessionId });
    expect(next.state === "question" && next.question.index).toBe(1);
    expect(await guardian.mutation(api.practice.submitAnswer, args)).toEqual(feedback[0]);
    expect(await t.run((ctx) => ctx.db.get(sessionId))).toMatchObject({ answeredCount: 1, correctCount: 1, currentIndex: 1 });
  });
  it("resolves competing different answers with a single first result", async () => {
    const { guardian, start, question, t } = await fixture();
    const sessionId = await guardian.mutation(api.practice.startSession, start);
    const correct = (await question(sessionId))!.correctAnswer;
    const results = await Promise.allSettled([correct, "wrong"].map((text) => guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text } })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("practiceAnswers").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(sessionId))).toMatchObject({ answeredCount: 1, objectiveCount: 1 });
  });
  it("grades snapshots after edits, excludes inactive words from new sessions and completes with exact totals", async () => {
    const { guardian, start, question, t, listId } = await fixture();
    const [inactive] = await guardian.query(api.words.listForAdmin, { listId });
    await guardian.mutation(api.words.setActive, { wordId: inactive._id, isActive: false });
    const sessionId = await guardian.mutation(api.practice.startSession, { ...start, count: 10 });
    const snapshots = await t.run((ctx) => ctx.db.query("practiceQuestions").withIndex("by_session_question", (q) => q.eq("sessionId", sessionId)).collect());
    expect(snapshots).toHaveLength(5); expect(snapshots.map((q) => q.wordId)).not.toContain(inactive._id);
    const first = (await question(sessionId))!;
    const word = (await guardian.query(api.words.listForAdmin, { listId })).find((word) => word._id === first.wordId)!;
    await guardian.mutation(api.words.updateWord, { wordId: word._id, expectedVersion: 1, spanish: "changed", swedish: word.swedish, acceptedSpanish: [], acceptedSwedish: [] });
    for (let index = 0; index < 5; index++) {
      const snapshot = (await question(sessionId, index))!;
      await guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: index, submission: { kind: "written", text: index < 3 ? snapshot.correctAnswer : "wrong" } });
      await guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: index });
    }
    const result = await guardian.query(api.practice.getResults, { sessionId });
    expect(result).toMatchObject({ correctCount: 3, objectiveCount: 5, selfAssessedCount: 0, session: { status: "completed", answeredCount: 5 } });
    expect(result.answers[0].feedback.correctAnswer).toBe(first.correctAnswer);
    await guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 4 });
    expect(await t.run((ctx) => ctx.db.get(sessionId))).toMatchObject({ answeredCount: 5 });
  });
  it("requires flashcard reveal, persists it, and separates self-ratings from correctness", async () => {
    const { guardian, start } = await fixture("sí;ja");
    const sessionId = await guardian.mutation(api.practice.startSession, { ...start, mode: "flashcard" });
    expect(JSON.stringify(await guardian.query(api.practice.getCurrentQuestion, { sessionId }))).not.toContain("sí");
    const args = { sessionId, questionIndex: 0, submission: { kind: "flashcard" as const, rating: "known" as const } };
    await expect(guardian.mutation(api.practice.submitAnswer, args)).rejects.toThrow("Vänd kortet");
    expect(await guardian.mutation(api.practice.revealFlashcard, { sessionId, questionIndex: 0 })).toBe("sí");
    const refreshed = await guardian.query(api.practice.getCurrentQuestion, { sessionId });
    expect(refreshed.state === "question" && refreshed.question.revealedAnswer).toBe("sí");
    await guardian.mutation(api.practice.submitAnswer, args);
    await guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 });
    const results = await guardian.query(api.practice.getResults, { sessionId });
    expect(results).toMatchObject({ objectiveCount: 0, correctCount: 0, selfKnownCount: 1, selfAssessedCount: 1 });
    expect(results.answers[0].feedback).not.toHaveProperty("isCorrect");
  });
  it("grades choice IDs on the server, denies forged IDs and falls back on tiny lists", async () => {
    const { guardian, start, question } = await fixture();
    const sessionId = await guardian.mutation(api.practice.startSession, { ...start, mode: "multiple_choice" });
    const view = await guardian.query(api.practice.getCurrentQuestion, { sessionId });
    expect(JSON.stringify(view)).not.toContain("correctOptionId");
    await expect(guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "multiple_choice", optionId: "forged" } })).rejects.toThrow("svarsalternativ");
    const optionId = (await question(sessionId))!.correctOptionId!;
    expect(await guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "multiple_choice", optionId } })).toMatchObject({ isCorrect: true });
    const tiny = await fixture("rojo;röd\nazul;blå");
    const tinyId = await tiny.guardian.mutation(api.practice.startSession, { ...tiny.start, mode: "multiple_choice" });
    const fallback = await tiny.guardian.query(api.practice.getCurrentQuestion, { sessionId: tinyId });
    expect(fallback.state === "question" && fallback.question.mode).toBe("written");
  });
  it("stops an archived/draft list without leaking the unanswered snapshot and preserves answered history", async () => {
    const { guardian, start, listId } = await fixture("secreto;hemligt");
    const sessionId = await guardian.mutation(api.practice.startSession, start);
    await guardian.mutation(api.lists.setStatus, { listId, status: "archived" });
    expect((await guardian.query(api.practice.getCurrentQuestion, { sessionId })).state).toBe("unavailable");
    await expect(guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "x" } })).rejects.toThrow("inte tillgänglig");
    expect((await guardian.query(api.practice.home)).lists).toEqual([]);
    await guardian.mutation(api.practice.abandonSession, { sessionId });
    const result = await guardian.query(api.practice.getResults, { sessionId });
    expect(result.answers).toEqual([]); expect(JSON.stringify(result)).not.toContain("secreto");
    await expect(guardian.mutation(api.practice.startSession, { ...start, requestId: crypto.randomUUID() })).rejects.toThrow("inte tillgänglig");
  });
  it("rejects skipping, oversized submissions, wrong modes and client scores", async () => {
    const { guardian, start, t } = await fixture();
    const sessionId = await guardian.mutation(api.practice.startSession, start);
    await expect(guardian.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 })).rejects.toThrow("Besvara");
    for (const index of [-1, 0.5, 1, 10]) await expect(guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: index, submission: { kind: "written", text: "x" } })).rejects.toThrow();
    for (const text of ["", "   ", "...", "a".repeat(5001)]) await expect(guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text } })).rejects.toThrow();
    await expect(guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "flashcard", rating: "known" } })).rejects.toThrow("fel övningsläge");
    // @ts-expect-error hostile clients bypass TS, but not the server validators
    await expect(guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "x" }, isCorrect: true, xp: 999 })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("practiceAnswers").collect())).toEqual([]);
  });
  it("bounds new sessions per day", async () => {
    const { guardian, start, t } = await fixture();
    const id = await guardian.mutation(api.practice.startSession, start);
    await guardian.mutation(api.practice.abandonSession, { sessionId: id });
    await t.run(async (ctx) => {
      const original = (await ctx.db.get(id))!;
      const { _id: ignoredId, _creationTime: ignoredTime, ...fields } = original;
      void ignoredId; void ignoredTime;
      for (let i = 1; i < 50; i++) await ctx.db.insert("practiceSessions", { ...fields, requestId: crypto.randomUUID() });
    });
    await expect(guardian.mutation(api.practice.startSession, { ...start, requestId: crypto.randomUUID() })).rejects.toThrow("50");
  });
});

describe("supervised access boundaries", () => {
  it("denies every practice read/write for anonymous, learner role and another family", async () => {
    const { t, guardian, other, learner, start, listId } = await fixture();
    const sessionId = await guardian.mutation(api.practice.startSession, start);
    for (const client of [t, learner, other]) {
      await expect(client.query(api.practice.getList, { listId })).rejects.toThrow();
      await expect(client.mutation(api.practice.startSession, start)).rejects.toThrow();
      await expect(client.query(api.practice.getCurrentQuestion, { sessionId })).rejects.toThrow();
      await expect(client.query(api.practice.getResults, { sessionId })).rejects.toThrow();
      await expect(client.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "x" } })).rejects.toThrow();
      await expect(client.mutation(api.practice.revealFlashcard, { sessionId, questionIndex: 0 })).rejects.toThrow();
      await expect(client.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: 0 })).rejects.toThrow();
      await expect(client.mutation(api.practice.abandonSession, { sessionId })).rejects.toThrow();
    }
    for (const client of [t, learner]) {
      await expect(client.query(api.practice.home)).rejects.toThrow();
      await expect(client.mutation(api.practice.saveProfile, { nickname: "intruder" })).rejects.toThrow();
    }
    expect((await other.query(api.practice.home)).lists).toEqual([]);
    // A guardian cannot select a different profile via a forged argument.
    // @ts-expect-error deliberately invalid client-supplied authority
    await expect(guardian.query(api.practice.getCurrentQuestion, { sessionId, profileId: "forged" })).rejects.toThrow();
  });
  it("checks current session and stored role on all practice calls", async () => {
    const { t, guardian, start, ids } = await fixture();
    const sessionId = await guardian.mutation(api.practice.startSession, start);
    await t.run((ctx) => ctx.db.delete(ids.sessions[0]));
    await expect(guardian.query(api.practice.getCurrentQuestion, { sessionId })).rejects.toThrow("UNAUTHENTICATED");
    await expect(guardian.mutation(api.practice.submitAnswer, { sessionId, questionIndex: 0, submission: { kind: "written", text: "x" } })).rejects.toThrow("UNAUTHENTICATED");
  });
});
