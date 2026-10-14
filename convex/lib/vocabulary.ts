import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { cellError, cleanText, detailsError, LIMITS, type ListDetails, type WordContent } from "../../src/lib/vocabulary/validation";

export const statusValidator = v.union(v.literal("draft"), v.literal("published"), v.literal("archived"));
export const detailsValidator = { title: v.string(), description: v.optional(v.string()), testDate: v.optional(v.string()) };
export const wordContentValidator = { spanish: v.string(), swedish: v.string(), acceptedSpanish: v.array(v.string()), acceptedSwedish: v.array(v.string()) };
export const listFields = {
  guardianId: v.id("users"), ...detailsValidator, status: statusValidator,
  createdAt: v.number(), updatedAt: v.number(), publishedAt: v.optional(v.number()),
  wordCount: v.number(), activeWordCount: v.number(), contentBytes: v.number(),
};
export const listDocument = v.object({ _id: v.id("vocabularyLists"), _creationTime: v.number(), ...listFields });
export const wordFields = {
  listId: v.id("vocabularyLists"), guardianId: v.id("users"), ...wordContentValidator,
  contentVersion: v.number(), sortOrder: v.number(), isActive: v.boolean(), createdAt: v.number(), updatedAt: v.number(),
};
export const wordDocument = v.object({ _id: v.id("words"), _creationTime: v.number(), ...wordFields });

export function validatedDetails(details: ListDetails) {
  const error = detailsError(details);
  if (error) throw new ConvexError(error);
  return { title: cleanText(details.title), description: details.description ? cleanText(details.description) : undefined, testDate: details.testDate || undefined };
}

export function validatedWord(word: WordContent): WordContent {
  for (const value of [word.spanish, word.swedish, ...word.acceptedSpanish, ...word.acceptedSwedish]) {
    const error = cellError(value);
    if (error) throw new ConvexError(error);
  }
  if (word.acceptedSpanish.length > LIMITS.aliases || word.acceptedSwedish.length > LIMITS.aliases) throw new ConvexError("Högst 10 alternativa svar per språk.");
  return { spanish: cleanText(word.spanish), swedish: cleanText(word.swedish), acceptedSpanish: [...new Set(word.acceptedSpanish.map(cleanText))], acceptedSwedish: [...new Set(word.acceptedSwedish.map(cleanText))] };
}

export async function insertList(ctx: MutationCtx, guardianId: Id<"users">, details: ListDetails) {
  const existing = await ctx.db.query("vocabularyLists").withIndex("by_guardian_status", (q) => q.eq("guardianId", guardianId)).take(LIMITS.lists);
  if (existing.length >= LIMITS.lists) throw new ConvexError("Högst 50 listor per familj i denna version.");
  return ctx.db.insert("vocabularyLists", { ...validatedDetails(details), guardianId, status: "draft", createdAt: Date.now(), updatedAt: Date.now(), wordCount: 0, activeWordCount: 0, contentBytes: 0 });
}
