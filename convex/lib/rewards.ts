import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { BadgeCode } from "../../src/lib/practice/rewards";

export const badgeCode = v.union(v.literal("first_session"), v.literal("ten_written"), v.literal("weekly_challenge"));
export const badgeView = v.object({ code: badgeCode, earnedAt: v.number(), sessionId: v.id("practiceSessions") });

// Called only inside the answer/completion transaction, never directly by clients.
export async function awardBadge(ctx: MutationCtx, profileId: Id<"learnerProfiles">, sessionId: Id<"practiceSessions">, code: BadgeCode, now: number) {
  const existing = await ctx.db.query("achievements").withIndex("by_profile_code", (q) => q.eq("profileId", profileId).eq("code", code)).unique();
  if (!existing) await ctx.db.insert("achievements", { profileId, sessionId, code, earnedAt: now });
}

export async function recordRewards(ctx: MutationCtx, profile: Doc<"learnerProfiles">, sessionId: Id<"practiceSessions">, xp: number, correctWritten: boolean, now: number) {
  const correctWrittenCount = (profile.correctWrittenCount ?? 0) + Number(correctWritten);
  await ctx.db.patch(profile._id, { totalXp: (profile.totalXp ?? 0) + xp, correctWrittenCount });
  if (correctWrittenCount >= 10) await awardBadge(ctx, profile._id, sessionId, "ten_written", now);
}
