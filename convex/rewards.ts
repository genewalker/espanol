import { v } from "convex/values";
import { familyQuery } from "./lib/authorization";
import { badgeView } from "./lib/rewards";

export const mine = familyQuery({
  args: {}, returns: v.union(v.null(), v.object({ totalXp: v.number(), correctWrittenCount: v.number(), badges: v.array(badgeView) })),
  handler: async (ctx) => {
    const profile = ctx.profile;
    if (!profile) return null;
    const earned = await ctx.db.query("achievements").withIndex("by_profile_code", (q) => q.eq("profileId", profile._id)).take(3);
    return { totalXp: profile.totalXp ?? 0, correctWrittenCount: profile.correctWrittenCount ?? 0,
      badges: earned.map(({ code, earnedAt, sessionId }) => ({ code, earnedAt, sessionId })) };
  },
});
