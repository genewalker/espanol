import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { initialProgress, review } from "../../src/lib/practice/repetition";
import { LIMITS } from "../../src/lib/vocabulary/validation";

export function progressForWord(word: Doc<"words">, progress: Doc<"wordProgress"> | undefined, now: number) {
  if (!progress || progress.contentVersion !== word.contentVersion) return initialProgress(now);
  const { attempts, correct, wrong, selfKnown, selfAgain, consecutiveCorrect, promotionPoints, masteryLevel, nextReviewAt, lastReviewedAt, lastSuccessful } = progress;
  return { attempts, correct, wrong, selfKnown, selfAgain, consecutiveCorrect, promotionPoints, masteryLevel, nextReviewAt, lastReviewedAt, lastSuccessful };
}

export async function listProgress(ctx: QueryCtx, profileId: Id<"learnerProfiles">, listId: Id<"vocabularyLists">) {
  const rows = await ctx.db.query("wordProgress").withIndex("by_profile_list", (q) => q.eq("profileId", profileId).eq("listId", listId)).take(LIMITS.wordsPerList);
  return new Map(rows.map((row) => [row.wordId, row]));
}

// Called only after the answer deduplication check, in the same transaction.
export async function recordProgress(ctx: MutationCtx, profileId: Id<"learnerProfiles">, question: Doc<"practiceQuestions">, successful: boolean, now: number) {
  const word = await ctx.db.get(question.wordId);
  // Old snapshots still get graded, but cannot restore progress for an old version.
  if (!word || !word.isActive || word.contentVersion !== question.contentVersion) return;
  const previous = await ctx.db.query("wordProgress").withIndex("by_profile_word", (q) => q.eq("profileId", profileId).eq("wordId", word._id)).unique();
  const next = review(progressForWord(word, previous ?? undefined, now), question.mode, successful, now);
  const values = { ...next, masteryLevel: next.masteryLevel as 0 | 1 | 2 | 3, contentVersion: word.contentVersion };
  if (previous) await ctx.db.patch(previous._id, values);
  else await ctx.db.insert("wordProgress", { profileId, wordId: word._id, listId: word.listId, ...values });
}
