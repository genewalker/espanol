import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { guardianMutation, guardianQuery, ownedList } from "./lib/authorization";
import { listProgress, progressForWord } from "./lib/progress";
import { progressValues } from "./lib/progressModel";
import { badgeView } from "./lib/rewards";
import { LIMITS } from "../src/lib/vocabulary/validation";

export const profile = guardianQuery({
  args: {}, returns: v.union(v.null(), v.object({ profileId: v.id("learnerProfiles"), nickname: v.string(), deleting: v.boolean() })),
  handler: async (ctx) => {
    const profile = await ctx.db.query("learnerProfiles").withIndex("by_guardian", (q) => q.eq("guardianId", ctx.user._id)).unique();
    return profile ? { profileId: profile._id, nickname: profile.nickname, deleting: profile.deleting === true } : null;
  },
});

// One bounded, consistent snapshot per list, including inactive words and drafts.
// Export deliberately excludes auth data, email and hidden question plans.
export const exportList = guardianQuery({
  args: { listId: v.id("vocabularyLists") }, returns: v.object({
    formatVersion: v.literal(1),
    list: v.object({ title: v.string(), description: v.optional(v.string()), testDate: v.optional(v.string()), status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")) }),
    profile: v.union(v.null(), v.object({ nickname: v.string(), totalXp: v.number(), correctWrittenCount: v.number(), badges: v.array(badgeView) })),
    words: v.array(v.object({ spanish: v.string(), swedish: v.string(), acceptedSpanish: v.array(v.string()), acceptedSwedish: v.array(v.string()), isActive: v.boolean(), contentVersion: v.number(), sortOrder: v.number(), progress: v.object(progressValues) })),
  }),
  handler: async (ctx, args) => {
    const list = await ownedList(ctx, args.listId, ctx.user._id);
    const profile = await ctx.db.query("learnerProfiles").withIndex("by_guardian", (q) => q.eq("guardianId", ctx.user._id)).unique();
    if (profile?.deleting) throw new ConvexError("Profilen håller på att raderas. Slutför raderingen först.");
    const words = await ctx.db.query("words").withIndex("by_list_order", (q) => q.eq("listId", list._id)).take(LIMITS.wordsPerList);
    const progress = profile ? await listProgress(ctx, profile._id, list._id) : new Map<Id<"words">, Doc<"wordProgress">>();
    const badges = profile ? await ctx.db.query("achievements").withIndex("by_profile_code", (q) => q.eq("profileId", profile._id)).take(3) : [];
    return { formatVersion: 1 as const,
      list: { title: list.title, description: list.description, testDate: list.testDate, status: list.status },
      profile: profile ? { nickname: profile.nickname, totalXp: profile.totalXp ?? 0, correctWrittenCount: profile.correctWrittenCount ?? 0, badges: badges.map(({ code, earnedAt, sessionId }) => ({ code, earnedAt, sessionId })) } : null,
      words: words.map((word) => {
        const current = progressForWord(word, progress.get(word._id), 0);
        return { spanish: word.spanish, swedish: word.swedish, acceptedSpanish: word.acceptedSpanish, acceptedSwedish: word.acceptedSwedish,
        isActive: word.isActive, contentVersion: word.contentVersion, sortOrder: word.sortOrder, progress: { ...current, masteryLevel: current.masteryLevel as 0 | 1 | 2 | 3 } };
      }),
    };
  },
});

export const beginProfileDeletion = guardianMutation({
  args: { profileId: v.id("learnerProfiles"), confirmation: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.guardianId !== ctx.user._id) throw new ConvexError("NOT_FOUND");
    if (args.confirmation !== "RADERA") throw new ConvexError("Skriv RADERA för att bekräfta.");
    await ctx.db.patch(profile._id, { deleting: true });
    return null;
  },
});

// Resumable and idempotent: bounded batches, no long-running job or new service.
// A deletion lock blocks practice writes until the old profile is fully removed.
export const deleteProfileBatch = guardianMutation({
  args: { profileId: v.id("learnerProfiles") }, returns: v.object({ done: v.boolean() }),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) return { done: true };
    if (profile.guardianId !== ctx.user._id) throw new ConvexError("NOT_FOUND");
    if (!profile.deleting) throw new ConvexError("Bekräfta raderingen först.");
    const session = await ctx.db.query("practiceSessions").withIndex("by_profile_created", (q) => q.eq("profileId", profile._id)).first();
    if (session) {
      const questions = await ctx.db.query("practiceQuestions").withIndex("by_session_question", (q) => q.eq("sessionId", session._id)).take(10);
      const answers = await ctx.db.query("practiceAnswers").withIndex("by_session_question", (q) => q.eq("sessionId", session._id)).take(10);
      for (const doc of [...questions, ...answers]) await ctx.db.delete(doc._id);
      await ctx.db.delete(session._id);
      return { done: false };
    }
    const progress = await ctx.db.query("wordProgress").withIndex("by_profile_word", (q) => q.eq("profileId", profile._id)).take(100);
    for (const doc of progress) await ctx.db.delete(doc._id);
    if (progress.length) return { done: false };
    const badges = await ctx.db.query("achievements").withIndex("by_profile_code", (q) => q.eq("profileId", profile._id)).take(3);
    for (const doc of badges) await ctx.db.delete(doc._id);
    await ctx.db.delete(profile._id);
    return { done: true };
  },
});
