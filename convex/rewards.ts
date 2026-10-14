import { v } from "convex/values";
import { guardianQuery } from "./lib/authorization";
import { badgeView } from "./lib/rewards";

export const mine = guardianQuery({
  args: {}, returns: v.union(v.null(), v.object({ totalXp: v.number(), correctWrittenCount: v.number(), badges: v.array(badgeView) })),
  handler: async (ctx) => {
    const profile = await ctx.db.query("learnerProfiles").withIndex("by_guardian", (q) => q.eq("guardianId", ctx.user._id)).unique();
    if (!profile) return null;
    const earned = await ctx.db.query("achievements").withIndex("by_profile_code", (q) => q.eq("profileId", profile._id)).take(3);
    return { totalXp: profile.totalXp ?? 0, correctWrittenCount: profile.correctWrittenCount ?? 0,
      badges: earned.map(({ code, earnedAt, sessionId }) => ({ code, earnedAt, sessionId })) };
  },
});
