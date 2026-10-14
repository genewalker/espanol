import { v } from "convex/values";

export const selectionValidator = v.union(v.literal("recommended"), v.literal("difficult"), v.literal("all"));
export const progressValues = {
  attempts: v.number(), correct: v.number(), wrong: v.number(), selfKnown: v.number(), selfAgain: v.number(),
  consecutiveCorrect: v.number(), promotionPoints: v.number(),
  masteryLevel: v.union(v.literal(0), v.literal(1), v.literal(2), v.literal(3)),
  nextReviewAt: v.number(), lastReviewedAt: v.optional(v.number()), lastSuccessful: v.optional(v.boolean()),
};
export const progressFields = {
  profileId: v.id("learnerProfiles"), listId: v.id("vocabularyLists"), wordId: v.id("words"), contentVersion: v.number(), ...progressValues,
};
export const progressReport = v.object({
  title: v.string(), listId: v.id("vocabularyLists"), status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  nickname: v.union(v.string(), v.null()),
  words: v.array(v.object({ wordId: v.id("words"), contentVersion: v.number(), swedish: v.string(), spanish: v.optional(v.string()), ...progressValues })),
  latestSession: v.union(v.null(), v.object({ sessionId: v.id("practiceSessions"), completedAt: v.number(), correct: v.number(), objective: v.number(), selfKnown: v.number(), selfAssessed: v.number() })),
});
