import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { guardianMutation, guardianQuery } from "./lib/authorization";
import { ownedSession, practiceMutation, practiceQuery, publishedList } from "./lib/practiceAccess";
import { directionValidator, feedbackValidator, modeValidator, optionValidator, publishedListView, sessionSummary, submissionValidator } from "./lib/practiceModel";
import { planQuestions, uniqueWords } from "./lib/practicePlan";
import { selectionValidator } from "./lib/progressModel";
import { listProgress, progressForWord, recordProgress } from "./lib/progress";
import { isDifficult, selectPracticeWords } from "../src/lib/practice/repetition";
import { cellError, cleanText, LIMITS } from "../src/lib/vocabulary/validation";
import { gradeWritten, normalizeAnswer } from "../src/lib/vocabulary/normalize";

const summary = (session: Doc<"practiceSessions">) => ({
  sessionId: session._id, listId: session.listId, listTitle: session.listTitle, mode: session.mode,
  status: session.status, questionCount: session.questionCount, answeredCount: session.answeredCount, createdAt: session.createdAt,
});
const listView = (list: Doc<"vocabularyLists">) => ({ listId: list._id, title: list.title, description: list.description, testDate: list.testDate, activeWordCount: list.activeWordCount });
const answerAt = (ctx: QueryCtx, sessionId: Id<"practiceSessions">, index: number) => ctx.db.query("practiceAnswers").withIndex("by_session_question", (q) => q.eq("sessionId", sessionId).eq("questionIndex", index)).unique();
async function questionAt(ctx: QueryCtx, sessionId: Id<"practiceSessions">, index: number) {
  const question = await ctx.db.query("practiceQuestions").withIndex("by_session_question", (q) => q.eq("sessionId", sessionId).eq("questionIndex", index)).unique();
  if (!question) throw new ConvexError("Frågan kunde inte hämtas.");
  return question;
}
function validIndex(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= 10) throw new ConvexError("Ogiltigt frågenummer.");
}
function submissionKey(submission: Infer<typeof submissionValidator>) {
  return JSON.stringify([submission.kind, submission.kind === "written" ? submission.text : submission.kind === "multiple_choice" ? submission.optionId : submission.rating]);
}

export const saveProfile = guardianMutation({
  args: { nickname: v.string() }, returns: v.id("learnerProfiles"),
  handler: async (ctx, args) => {
    const nickname = cleanText(args.nickname);
    if (!nickname || args.nickname.length > 32 || /[\p{C}\r\n]/u.test(nickname)) throw new ConvexError("Välj ett smeknamn med 1–32 tecken.");
    const existing = await ctx.db.query("learnerProfiles").withIndex("by_guardian", (q) => q.eq("guardianId", ctx.user._id)).unique();
    if (existing) { await ctx.db.patch(existing._id, { nickname }); return existing._id; }
    return ctx.db.insert("learnerProfiles", { guardianId: ctx.user._id, nickname, createdAt: Date.now() });
  },
});

export const home = guardianQuery({
  args: {}, returns: v.object({ nickname: v.union(v.string(), v.null()), lists: v.array(publishedListView), active: v.union(sessionSummary, v.null()), recent: v.array(sessionSummary) }),
  handler: async (ctx) => {
    const profile = await ctx.db.query("learnerProfiles").withIndex("by_guardian", (q) => q.eq("guardianId", ctx.user._id)).unique();
    const lists = await ctx.db.query("vocabularyLists").withIndex("by_guardian_status", (q) => q.eq("guardianId", ctx.user._id).eq("status", "published")).take(LIMITS.lists);
    const active = profile ? await ctx.db.query("practiceSessions").withIndex("by_profile_status", (q) => q.eq("profileId", profile._id).eq("status", "active")).unique() : null;
    const recent = profile ? await ctx.db.query("practiceSessions").withIndex("by_profile_created", (q) => q.eq("profileId", profile._id)).order("desc").take(5) : [];
    return { nickname: profile?.nickname ?? null, lists: lists.map(listView), active: active ? summary(active) : null, recent: recent.filter((session) => session.status !== "active").map(summary) };
  },
});

export const getList = practiceQuery({
  args: { listId: v.id("vocabularyLists") }, returns: publishedListView,
  handler: async (ctx, args) => listView(await publishedList(ctx, args.listId, ctx.user._id)),
});

export const startSession = practiceMutation({
  args: { listId: v.id("vocabularyLists"), mode: modeValidator, direction: directionValidator, count: v.union(v.literal(5), v.literal(10)), requestId: v.string(), selection: v.optional(selectionValidator) },
  returns: v.id("practiceSessions"),
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.requestId)) throw new ConvexError("Ogiltigt pass-ID.");
    const selection = args.selection ?? "recommended";
    const previous = await ctx.db.query("practiceSessions").withIndex("by_profile_request", (q) => q.eq("profileId", ctx.profile._id).eq("requestId", args.requestId)).unique();
    if (previous) {
      if (previous.listId !== args.listId || previous.mode !== args.mode || previous.direction !== args.direction || previous.requestedCount !== args.count || (previous.selection ?? "recommended") !== selection) throw new ConvexError("Pass-ID används redan för andra val.");
      return previous._id;
    }
    const list = await publishedList(ctx, args.listId, ctx.user._id);
    const active = await ctx.db.query("practiceSessions").withIndex("by_profile_status", (q) => q.eq("profileId", ctx.profile._id).eq("status", "active")).unique();
    if (active) throw new ConvexError("Ett pass pågår redan. Fortsätt eller avsluta det från övningsstarten.");
    const now = Date.now();
    const recent = await ctx.db.query("practiceSessions").withIndex("by_profile_created", (q) => q.eq("profileId", ctx.profile._id).gte("createdAt", now - 86_400_000)).take(50);
    if (recent.length >= 50) throw new ConvexError("Högst 50 nya pass under ett dygn. Försök igen senare.");
    const words = await ctx.db.query("words").withIndex("by_list_active", (q) => q.eq("listId", list._id).eq("isActive", true)).take(LIMITS.wordsPerList);
    const progress = await listProgress(ctx, ctx.profile._id, list._id);
    // Intentionally retained duplicate rows each have their own progress. Rotate
    // toward the least-practised row while still asking the expression only once.
    const ranked = words.map((word) => ({ word, progress: progressForWord(word, progress.get(word._id), now) }));
    ranked.sort((a, b) => (selection === "difficult" ? Number(isDifficult(a.progress)) - Number(isDifficult(b.progress)) : 0) || b.progress.attempts - a.progress.attempts);
    const distinctWords = uniqueWords(ranked.map((row) => row.word));
    const candidates = distinctWords.map((word) => ({ word, progress: progressForWord(word, progress.get(word._id), now) }));
    const selected = selection === "all" ? undefined : selectPracticeWords(candidates, args.count, selection, now).map((row) => row.word._id);
    if (selection === "difficult" && !selected?.length) throw new ConvexError("Inga svåra ord att repetera just nu. Välj Rekommenderat eller Hela listan.");
    // Distractors still come from the full list, even when reviewing a single word.
    const plan = planQuestions(distinctWords, args.mode, args.direction, args.count, Math.random, selected);
    if (!plan.length) throw new ConvexError("Listan har inga aktiva glosor.");
    const sessionId = await ctx.db.insert("practiceSessions", {
      guardianId: ctx.user._id, profileId: ctx.profile._id, listId: list._id, listTitle: list.title,
      requestId: args.requestId, requestedCount: args.count, mode: args.mode, direction: args.direction, selection, status: "active",
      questionCount: plan.length, currentIndex: 0, answeredCount: 0, correctCount: 0, objectiveCount: 0, selfKnownCount: 0, selfAssessedCount: 0, createdAt: now,
    });
    for (const question of plan) await ctx.db.insert("practiceQuestions", { sessionId, ...question });
    return sessionId;
  },
});

export const getCurrentQuestion = practiceQuery({
  args: { sessionId: v.id("practiceSessions") },
  returns: v.union(
    v.object({ state: v.literal("finished"), session: sessionSummary }),
    v.object({ state: v.literal("unavailable"), session: sessionSummary }),
    v.object({ state: v.literal("question"), session: sessionSummary, direction: directionValidator, requestedMode: modeValidator,
      question: v.object({ index: v.number(), prompt: v.string(), mode: modeValidator, options: v.optional(v.array(optionValidator)), revealedAnswer: v.optional(v.string()) }),
      feedback: v.union(feedbackValidator, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const session = await ownedSession(ctx, args.sessionId, ctx.profile._id, ctx.user._id);
    if (session.status !== "active") return { state: "finished" as const, session: summary(session) };
    const list = await ctx.db.get(session.listId);
    if (!list || list.guardianId !== ctx.user._id || list.status !== "published") return { state: "unavailable" as const, session: summary(session) };
    const question = await questionAt(ctx, session._id, session.currentIndex);
    const answer = await answerAt(ctx, session._id, session.currentIndex);
    // Explicit allowlist: never spread a stored question, even after answering.
    return {
      state: "question" as const, session: summary(session), direction: session.direction, requestedMode: session.mode,
      question: { index: question.questionIndex, prompt: question.prompt, mode: question.mode, options: question.options,
        ...(question.mode === "flashcard" && question.revealedAt !== undefined ? { revealedAnswer: question.correctAnswer } : {}),
      }, feedback: answer?.feedback ?? null,
    };
  },
});

export const revealFlashcard = practiceMutation({
  args: { sessionId: v.id("practiceSessions"), questionIndex: v.number() }, returns: v.string(),
  handler: async (ctx, args) => {
    validIndex(args.questionIndex);
    const session = await ownedSession(ctx, args.sessionId, ctx.profile._id, ctx.user._id);
    await publishedList(ctx, session.listId, ctx.user._id);
    if (session.status !== "active" || session.currentIndex !== args.questionIndex) throw new ConvexError("Frågan är inte aktiv.");
    const question = await questionAt(ctx, session._id, args.questionIndex);
    if (question.mode !== "flashcard") throw new ConvexError("Bara flashcards kan vändas.");
    if (question.revealedAt === undefined) await ctx.db.patch(question._id, { revealedAt: Date.now() });
    return question.correctAnswer;
  },
});

export const submitAnswer = practiceMutation({
  args: { sessionId: v.id("practiceSessions"), questionIndex: v.number(), submission: submissionValidator }, returns: feedbackValidator,
  handler: async (ctx, args) => {
    validIndex(args.questionIndex);
    const session = await ownedSession(ctx, args.sessionId, ctx.profile._id, ctx.user._id);
    const submission = args.submission;
    if (submission.kind === "written" && (cellError(submission.text) || !normalizeAnswer(submission.text))) throw new ConvexError("Skriv ett svar med 1–5 000 tecken.");
    if (submission.kind === "multiple_choice" && submission.optionId.length > 32) throw new ConvexError("Ogiltigt svarsalternativ.");
    const previous = await answerAt(ctx, session._id, args.questionIndex);
    if (previous) {
      if (submissionKey(previous.submission) !== submissionKey(submission)) throw new ConvexError("Frågan är redan besvarad. Det första svaret gäller.");
      return previous.feedback;
    }
    await publishedList(ctx, session.listId, ctx.user._id);
    if (session.status !== "active" || session.currentIndex !== args.questionIndex) throw new ConvexError("Frågan är inte aktiv.");
    const question = await questionAt(ctx, session._id, args.questionIndex);
    if (submission.kind !== question.mode) throw new ConvexError("Svaret har fel övningsläge.");
    let feedback: Infer<typeof feedbackValidator>;
    if (submission.kind === "written") {
      feedback = { kind: "objective", correctAnswer: question.correctAnswer, submittedText: submission.text, ...gradeWritten(submission.text, question.correctAnswer, question.acceptedAnswers) };
    } else if (submission.kind === "multiple_choice") {
      const option = question.options?.find((choice) => choice.id === submission.optionId);
      if (!option) throw new ConvexError("Välj ett av frågans svarsalternativ.");
      feedback = { kind: "objective", correctAnswer: question.correctAnswer, submittedText: option.text, isCorrect: submission.optionId === question.correctOptionId };
    } else {
      if (question.revealedAt === undefined) throw new ConvexError("Vänd kortet innan du skattar ditt svar.");
      feedback = { kind: "self_assessed", correctAnswer: question.correctAnswer, submittedText: submission.rating === "known" ? "Kunde" : "Behöver öva", selfRating: submission.rating };
    }
    const now = Date.now();
    await ctx.db.insert("practiceAnswers", { sessionId: session._id, profileId: ctx.profile._id, questionIndex: args.questionIndex, wordId: question.wordId, contentVersion: question.contentVersion, mode: question.mode, direction: session.direction, submission, feedback, createdAt: now });
    await recordProgress(ctx, ctx.profile._id, question, feedback.kind === "objective" ? feedback.isCorrect === true : feedback.selfRating === "known", now);
    await ctx.db.patch(session._id, {
      answeredCount: session.answeredCount + 1,
      objectiveCount: session.objectiveCount + (feedback.kind === "objective" ? 1 : 0),
      correctCount: session.correctCount + (feedback.isCorrect ? 1 : 0),
      selfAssessedCount: session.selfAssessedCount + (feedback.kind === "self_assessed" ? 1 : 0),
      selfKnownCount: session.selfKnownCount + (feedback.selfRating === "known" ? 1 : 0),
    });
    return feedback;
  },
});

export const advanceQuestion = practiceMutation({
  args: { sessionId: v.id("practiceSessions"), questionIndex: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    validIndex(args.questionIndex);
    const session = await ownedSession(ctx, args.sessionId, ctx.profile._id, ctx.user._id);
    if (args.questionIndex < session.currentIndex) return null;
    await publishedList(ctx, session.listId, ctx.user._id);
    if (session.status !== "active" || session.currentIndex !== args.questionIndex) throw new ConvexError("Frågan är inte aktiv.");
    if (!await answerAt(ctx, session._id, args.questionIndex)) throw new ConvexError("Besvara frågan först.");
    const next = session.currentIndex + 1;
    await ctx.db.patch(session._id, { currentIndex: next, ...(next === session.questionCount ? { status: "completed" as const, completedAt: Date.now() } : {}) });
    return null;
  },
});

export const abandonSession = practiceMutation({
  args: { sessionId: v.id("practiceSessions") }, returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ownedSession(ctx, args.sessionId, ctx.profile._id, ctx.user._id);
    if (session.status === "active") await ctx.db.patch(session._id, { status: "abandoned", completedAt: Date.now() });
    return null;
  },
});

export const getResults = practiceQuery({
  args: { sessionId: v.id("practiceSessions") }, returns: v.object({
    session: sessionSummary, direction: directionValidator, correctCount: v.number(), objectiveCount: v.number(),
    selfKnownCount: v.number(), selfAssessedCount: v.number(),
    answers: v.array(v.object({ index: v.number(), prompt: v.string(), mode: modeValidator, feedback: feedbackValidator })),
  }),
  handler: async (ctx, args) => {
    const session = await ownedSession(ctx, args.sessionId, ctx.profile._id, ctx.user._id);
    if (session.status === "active") throw new ConvexError("Avsluta passet innan du öppnar resultatet.");
    const answers = await ctx.db.query("practiceAnswers").withIndex("by_session_question", (q) => q.eq("sessionId", session._id)).take(10);
    const views = await Promise.all(answers.map(async (answer) => ({ index: answer.questionIndex, prompt: (await questionAt(ctx, session._id, answer.questionIndex)).prompt, mode: answer.mode, feedback: answer.feedback })));
    return { session: summary(session), direction: session.direction, correctCount: session.correctCount, objectiveCount: session.objectiveCount,
      selfKnownCount: session.selfKnownCount, selfAssessedCount: session.selfAssessedCount, answers: views };
  },
});
