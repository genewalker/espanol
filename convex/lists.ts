import { ConvexError, v } from "convex/values";
import { guardianMutation, guardianQuery, learnerQuery, ownedList } from "./lib/authorization";
import { detailsValidator, insertList, listDocument, statusValidator, validatedDetails } from "./lib/vocabulary";
import { LIMITS } from "../src/lib/vocabulary/validation";

export const listMine = guardianQuery({
  args: {}, returns: v.array(listDocument),
  handler: (ctx) => ctx.db.query("vocabularyLists").withIndex("by_guardian_status", (q) => q.eq("guardianId", ctx.user._id)).take(LIMITS.lists),
});

export const getForAdmin = guardianQuery({
  args: { listId: v.id("vocabularyLists") }, returns: listDocument,
  handler: (ctx, args) => ownedList(ctx, args.listId, ctx.user._id),
});

export const create = guardianMutation({
  args: detailsValidator, returns: v.id("vocabularyLists"),
  handler: (ctx, args) => insertList(ctx, ctx.user._id, args),
});

export const update = guardianMutation({
  args: { listId: v.id("vocabularyLists"), ...detailsValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    await ownedList(ctx, args.listId, ctx.user._id);
    await ctx.db.patch(args.listId, { ...validatedDetails(args), updatedAt: Date.now() });
    return null;
  },
});

export const setStatus = guardianMutation({
  args: { listId: v.id("vocabularyLists"), status: statusValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    const list = await ownedList(ctx, args.listId, ctx.user._id);
    if (args.status === "published" && list.activeWordCount === 0) throw new ConvexError("Lägg till minst en aktiv glosa innan du publicerar.");
    await ctx.db.patch(list._id, { status: args.status, updatedAt: Date.now(), ...(args.status === "published" ? { publishedAt: list.publishedAt ?? Date.now() } : {}) });
    return null;
  },
});

// Metadata only: useful for authorization tests now and the learner homepage later.
const publishedView = v.object({ _id: v.id("vocabularyLists"), title: v.string(), description: v.optional(v.string()), testDate: v.optional(v.string()), activeWordCount: v.number() });
const toPublishedView = (list: { _id: import("./_generated/dataModel").Id<"vocabularyLists">; title: string; description?: string; testDate?: string; activeWordCount: number }) => ({ _id: list._id, title: list.title, description: list.description, testDate: list.testDate, activeWordCount: list.activeWordCount });

export const listPublishedForLearner = learnerQuery({
  args: {}, returns: v.array(publishedView),
  handler: async (ctx) => (await ctx.db.query("vocabularyLists").withIndex("by_guardian_status", (q) => q.eq("guardianId", ctx.guardianId).eq("status", "published")).take(LIMITS.lists)).map(toPublishedView),
});

export const getPublishedForLearner = learnerQuery({
  args: { listId: v.id("vocabularyLists") }, returns: publishedView,
  handler: async (ctx, args) => {
    const list = await ownedList(ctx, args.listId, ctx.guardianId);
    if (list.status !== "published") throw new ConvexError("NOT_FOUND");
    return toPublishedView(list);
  },
});
