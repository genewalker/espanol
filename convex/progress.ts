import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { guardianQuery, ownedList } from "./lib/authorization";
import { practiceQuery, publishedList } from "./lib/practiceAccess";
import { listProgress, progressForWord } from "./lib/progress";
import { progressReport } from "./lib/progressModel";
import { LIMITS } from "../src/lib/vocabulary/validation";

async function report(ctx: QueryCtx, list: Doc<"vocabularyLists">, profile: Doc<"learnerProfiles"> | null, admin: boolean) {
  const words = await ctx.db.query("words").withIndex("by_list_active", (q) => q.eq("listId", list._id).eq("isActive", true)).take(LIMITS.wordsPerList);
  const progress = profile ? await listProgress(ctx, profile._id, list._id) : new Map<Id<"words">, Doc<"wordProgress">>();
  const latest = profile ? await ctx.db.query("practiceSessions").withIndex("by_profile_list_status_completed", (q) => q.eq("profileId", profile._id).eq("listId", list._id).eq("status", "completed")).order("desc").first() : null;
  return {
    title: list.title, listId: list._id, status: list.status, nickname: profile?.nickname ?? null,
    words: words.map((word) => {
      const current = progressForWord(word, progress.get(word._id), 0);
      return { wordId: word._id, contentVersion: word.contentVersion, swedish: word.swedish,
        ...(admin ? { spanish: word.spanish } : {}), ...current, masteryLevel: current.masteryLevel as 0 | 1 | 2 | 3 };
    }),
    latestSession: latest ? { sessionId: latest._id, completedAt: latest.completedAt!, correct: latest.correctCount, objective: latest.objectiveCount, selfKnown: latest.selfKnownCount, selfAssessed: latest.selfAssessedCount } : null,
  };
}

export const myOverview = practiceQuery({
  args: { listId: v.id("vocabularyLists") }, returns: progressReport,
  handler: async (ctx, args) => report(ctx, await publishedList(ctx, args.listId, ctx.user._id), ctx.profile, false),
});

export const guardianLearnerOverview = guardianQuery({
  args: { listId: v.id("vocabularyLists") }, returns: progressReport,
  handler: async (ctx, args) => {
    const list = await ownedList(ctx, args.listId, ctx.user._id);
    const profile = await ctx.db.query("learnerProfiles").withIndex("by_guardian", (q) => q.eq("guardianId", ctx.user._id)).unique();
    return report(ctx, list, profile, true);
  },
});
