import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// The profile's deletion flag blocks new login, refresh and private access.
// Clear credentials and auth rows in bounded batches before removing the profile.
export async function deleteLearnerAuthBatch(ctx: MutationCtx, profile: Doc<"learnerProfiles">) {
  if (!profile.learnerUserId) return true;
  const user = await ctx.db.get(profile.learnerUserId);
  if (!user) return true;
  if (user.role !== "learner" || user.guardianId !== profile.guardianId) throw new ConvexError("FORBIDDEN");
  const session = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", user._id)).first();
  if (session) {
    const tokens = await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", session._id)).take(100);
    for (const token of tokens) await ctx.db.delete(token._id);
    if (tokens.length === 0) await ctx.db.delete(session._id);
    return false;
  }
  const account = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", user._id)).first();
  if (account) {
    const codes = await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", account._id)).take(100);
    for (const code of codes) await ctx.db.delete(code._id);
    if (codes.length) return false;
    const limit = await ctx.db.query("authRateLimits").withIndex("identifier", (q) => q.eq("identifier", account._id)).unique();
    if (limit) await ctx.db.delete(limit._id);
    await ctx.db.delete(account._id);
    return false;
  }
  // This credentials-only provider creates no OAuth/PKCE authVerifiers.
  await ctx.db.delete(user._id);
  return true;
}
