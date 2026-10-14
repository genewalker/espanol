import { getAuthUserId, getAuthSessionId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";

export const guardianViewer = query({
  args: {},
  returns: v.object({ nickname: v.string(), role: v.literal("guardian") }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const sessionId = await getAuthSessionId(ctx);
    if (!userId || !sessionId) throw new ConvexError("UNAUTHENTICATED");
    // Check session existence too: sign-out should revoke this query immediately,
    // even while a previously issued short-lived JWT has not yet expired.
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId || session.expirationTime <= Date.now()) {
      throw new ConvexError("UNAUTHENTICATED");
    }
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "guardian") throw new ConvexError("FORBIDDEN");
    return { nickname: user.nickname ?? "Förälder", role: "guardian" as const };
  },
});
