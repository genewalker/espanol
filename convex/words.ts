import { ConvexError, v } from "convex/values";
import { guardianMutation, guardianQuery, ownedList } from "./lib/authorization";
import { validatedWord, wordContentValidator, wordDocument } from "./lib/vocabulary";
import { LIMITS, wordBytes } from "../src/lib/vocabulary/validation";
import { initialProgress } from "../src/lib/practice/repetition";

export const listForAdmin = guardianQuery({
  args: { listId: v.id("vocabularyLists") }, returns: v.array(wordDocument),
  handler: async (ctx, args) => {
    await ownedList(ctx, args.listId, ctx.user._id);
    return ctx.db.query("words").withIndex("by_list_order", (q) => q.eq("listId", args.listId)).take(LIMITS.wordsPerList);
  },
});

export const updateWord = guardianMutation({
  args: { wordId: v.id("words"), expectedVersion: v.number(), ...wordContentValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    const word = await ctx.db.get(args.wordId);
    if (!word || word.guardianId !== ctx.user._id) throw new ConvexError("NOT_FOUND");
    const list = await ownedList(ctx, word.listId, ctx.user._id);
    if (list.status === "archived") throw new ConvexError("Återställ listan till utkast innan du redigerar.");
    if (word.contentVersion !== args.expectedVersion) throw new ConvexError("Glosan har ändrats i en annan vy. Ladda om och försök igen.");
    const content = validatedWord(args);
    const changed = JSON.stringify([word.spanish, word.swedish, word.acceptedSpanish, word.acceptedSwedish]) !== JSON.stringify([content.spanish, content.swedish, content.acceptedSpanish, content.acceptedSwedish]);
    if (!changed) return null;
    const contentBytes = list.contentBytes - wordBytes(word) + wordBytes(content);
    if (contentBytes > LIMITS.listBytes) throw new ConvexError("Listans text får vara högst 2 MB.");
    await ctx.db.patch(word._id, { ...content, contentVersion: word.contentVersion + 1, updatedAt: Date.now() });
    await ctx.db.patch(list._id, { contentBytes, updatedAt: Date.now() });
    // MVP has one supervised profile per guardian. Reset only current progress;
    // immutable practiceAnswers and practiceQuestions retain their old snapshots.
    const profile = await ctx.db.query("learnerProfiles").withIndex("by_guardian", (q) => q.eq("guardianId", ctx.user._id)).unique();
    if (profile) {
      const progress = await ctx.db.query("wordProgress").withIndex("by_profile_word", (q) => q.eq("profileId", profile._id).eq("wordId", word._id)).unique();
      if (progress) await ctx.db.patch(progress._id, { ...initialProgress(Date.now()), masteryLevel: 0, lastReviewedAt: undefined, lastSuccessful: undefined, contentVersion: word.contentVersion + 1 });
    }
    return null;
  },
});

export const setActive = guardianMutation({
  args: { wordId: v.id("words"), isActive: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const word = await ctx.db.get(args.wordId);
    if (!word || word.guardianId !== ctx.user._id) throw new ConvexError("NOT_FOUND");
    const list = await ownedList(ctx, word.listId, ctx.user._id);
    if (list.status === "archived") throw new ConvexError("Återställ listan till utkast innan du redigerar.");
    if (word.isActive === args.isActive) return null;
    const activeWordCount = list.activeWordCount + (args.isActive ? 1 : -1);
    await ctx.db.patch(word._id, { isActive: args.isActive, updatedAt: Date.now() });
    await ctx.db.patch(list._id, { activeWordCount, updatedAt: Date.now(), ...(activeWordCount === 0 && list.status === "published" ? { status: "draft" as const } : {}) });
    return null;
  },
});
