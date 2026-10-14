import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { ConvexError } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { activeLearnerProfile } from "./learnerAuth";

export async function authenticatedUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  const sessionId = await getAuthSessionId(ctx);
  if (!userId || !sessionId) throw new ConvexError("UNAUTHENTICATED");
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId || session.expirationTime <= Date.now()) throw new ConvexError("UNAUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user || !user.role) throw new ConvexError("FORBIDDEN");
  return user;
}

export async function requireGuardian(ctx: QueryCtx) {
  const user = await authenticatedUser(ctx);
  if (user.role !== "guardian") throw new ConvexError("FORBIDDEN");
  return user;
}

export async function familyContext(ctx: QueryCtx) {
  const user = await authenticatedUser(ctx);
  const guardianId = user.role === "guardian" ? user._id : user.guardianId!;
  const profile = user.role === "learner" ? await activeLearnerProfile(ctx, user) : await ctx.db.query("learnerProfiles").withIndex("by_guardian", (q) => q.eq("guardianId", guardianId)).unique();
  return { user, guardianId, profile };
}
export const familyQuery = customQuery(query, customCtx(familyContext));

export const guardianQuery = customQuery(query, customCtx(async (ctx) => ({ user: await requireGuardian(ctx) })));
export const guardianMutation = customMutation(mutation, customCtx(async (ctx) => ({ user: await requireGuardian(ctx) })));

export const learnerQuery = customQuery(query, customCtx(async (ctx) => {
  const user = await authenticatedUser(ctx);
  if (user.role !== "learner" || !user.guardianId) throw new ConvexError("FORBIDDEN");
  await activeLearnerProfile(ctx, user);
  const guardian = await ctx.db.get(user.guardianId);
  if (guardian?.role !== "guardian") throw new ConvexError("FORBIDDEN");
  return { user, guardianId: guardian._id };
}));

export async function ownedList(ctx: QueryCtx, listId: Id<"vocabularyLists">, guardianId: Id<"users">) {
  const list = await ctx.db.get(listId);
  if (!list || list.guardianId !== guardianId) throw new ConvexError("NOT_FOUND");
  return list;
}
