import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { ConvexError } from "convex/values";
import { query, mutation, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { familyContext } from "./authorization";

async function practiceContext(ctx: QueryCtx) {
  const { user, guardianId, profile } = await familyContext(ctx);
  if (!profile) throw new ConvexError("Skapa en övningsprofil först.");
  if (profile.deleting) throw new ConvexError("Profilen håller på att raderas. Gå till Dina data på föräldrasidan.");
  return { user, guardianId, profile };
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
