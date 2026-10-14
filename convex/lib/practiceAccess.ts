import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { ConvexError } from "convex/values";
import { query, mutation, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireGuardian } from "./authorization";

// PRD §3 fallback: only the authenticated guardian may use this supervised flow.
async function practiceContext(ctx: QueryCtx) {
  const user = await requireGuardian(ctx);
  const profile = await ctx.db.query("learnerProfiles").withIndex("by_guardian", (q) => q.eq("guardianId", user._id)).unique();
  if (!profile) throw new ConvexError("Skapa en övningsprofil först.");
  return { user, profile };
}
export const practiceQuery = customQuery(query, customCtx(practiceContext));
export const practiceMutation = customMutation(mutation, customCtx(practiceContext));

export async function ownedSession(ctx: QueryCtx, sessionId: Id<"practiceSessions">, profileId: Id<"learnerProfiles">, guardianId: Id<"users">) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.profileId !== profileId || session.guardianId !== guardianId) throw new ConvexError("NOT_FOUND");
  return session;
}

export async function publishedList(ctx: QueryCtx, listId: Id<"vocabularyLists">, guardianId: Id<"users">) {
  const list = await ctx.db.get(listId);
  if (!list || list.guardianId !== guardianId || list.status !== "published") throw new ConvexError("Listan är inte tillgänglig för övning.");
  return list;
}
