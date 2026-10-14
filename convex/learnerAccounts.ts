import { createAccount, modifyAccountCredentials, invalidateSessions } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { guardianMutation, guardianQuery } from "./lib/authorization";
import { activeLearnerProfile, authMutationContext, LEARNER_PROVIDER, learnerPassword, learnerUsername } from "./lib/learnerAuth";

async function limitChanges(ctx: MutationCtx, profile: Doc<"learnerProfiles">) {
  const now = Date.now();
  const sameWindow = now - (profile.authWindowAt ?? 0) < 3_600_000;
  const count = sameWindow ? profile.authChanges ?? 0 : 0;
  if (count >= 10) throw new ConvexError("För många kontoändringar. Försök igen om en timme.");
  await ctx.db.patch(profile._id, { authWindowAt: sameWindow ? profile.authWindowAt : now, authChanges: count + 1 });
}

export const status = guardianQuery({
  args: {}, returns: v.union(v.null(), v.object({ profileId: v.id("learnerProfiles"), nickname: v.string(), deleting: v.boolean(), username: v.union(v.string(), v.null()), version: v.number() })),
  handler: async (ctx) => {
    const profile = await ctx.db.query("learnerProfiles").withIndex("by_guardian", (q) => q.eq("guardianId", ctx.user._id)).unique();
    if (!profile) return null;
    const learner = profile.learnerUserId ? await ctx.db.get(profile.learnerUserId) : null;
    return { profileId: profile._id, nickname: profile.nickname, deleting: profile.deleting ?? false, username: profile.learnerUsername ?? null, version: learner?.credentialVersion ?? 0 };
  },
});

export const create = guardianMutation({
  args: { profileId: v.id("learnerProfiles"), username: v.string(), password: v.string(), consent: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.consent) throw new ConvexError("Bekräfta att du vill skapa och ansvara för barnets konto.");
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.guardianId !== ctx.user._id) throw new ConvexError("NOT_FOUND");
    if (profile.deleting) throw new ConvexError("Profilen håller på att raderas.");
    if (profile.learnerUserId) throw new ConvexError("Barnet har redan ett konto. Använd Byt lösenord.");
    const username = learnerUsername(args.username);
    const password = learnerPassword(args.password);
    const exists = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", (q) => q.eq("provider", LEARNER_PROVIDER).eq("providerAccountId", username)).unique();
    if (exists) throw new ConvexError("Användarnamnet är upptaget. Välj ett annat.");
    await limitChanges(ctx, profile);
    const { user } = await createAccount<DataModel>(authMutationContext(ctx), {
      provider: LEARNER_PROVIDER, account: { id: username, secret: password },
      profile: { role: "learner", guardianId: ctx.user._id, credentialVersion: 1 },
      shouldLinkViaEmail: false, shouldLinkViaPhone: false,
    });
    if (user.role !== "learner" || user.guardianId !== ctx.user._id) throw new ConvexError("FORBIDDEN");
    await ctx.db.patch(profile._id, { learnerUserId: user._id, learnerUsername: username });
    return null;
  },
});

export const resetPassword = guardianMutation({
  args: { profileId: v.id("learnerProfiles"), expectedVersion: v.number(), newPassword: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.guardianId !== ctx.user._id || !profile.learnerUserId || !profile.learnerUsername) throw new ConvexError("NOT_FOUND");
    if (profile.deleting) throw new ConvexError("Profilen håller på att raderas.");
    const user = await ctx.db.get(profile.learnerUserId);
    if (!user || user.role !== "learner" || user.guardianId !== ctx.user._id) throw new ConvexError("FORBIDDEN");
    if (args.expectedVersion !== user.credentialVersion) throw new ConvexError("Lösenordet har redan ändrats. Ladda om sidan innan du försöker igen.");
    const secret = learnerPassword(args.newPassword);
    await limitChanges(ctx, profile);
    await modifyAccountCredentials(authMutationContext(ctx), { provider: LEARNER_PROVIDER, account: { id: profile.learnerUsername, secret } });
    await invalidateSessions(authMutationContext(ctx), { userId: user._id });
    await ctx.db.patch(user._id, { credentialVersion: user.credentialVersion! + 1 });
    const account = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", user._id).eq("provider", LEARNER_PROVIDER)).unique();
    if (account) {
      const limit = await ctx.db.query("authRateLimits").withIndex("identifier", (q) => q.eq("identifier", account._id)).unique();
      if (limit) await ctx.db.delete(limit._id);
    }
    return null;
  },
});

// Capture the version BEFORE password verification. A reset between verification
// and session creation must fail, even if both operations otherwise succeed.
export const loginVersion = internalQuery({
  args: { username: v.string() }, returns: v.union(v.null(), v.object({ userId: v.id("users"), version: v.number() })),
  handler: async (ctx, args) => {
    const account = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", (q) => q.eq("provider", LEARNER_PROVIDER).eq("providerAccountId", args.username)).unique();
    const user = account ? await ctx.db.get(account.userId) : null;
    if (!user || user.role !== "learner") return null;
    await activeLearnerProfile(ctx, user);
    return { userId: user._id, version: user.credentialVersion ?? 0 };
  },
});

export const createSession = internalMutation({
  args: { userId: v.id("users"), version: v.number() }, returns: v.object({ userId: v.id("users"), sessionId: v.id("authSessions") }),
  handler: async (ctx, args): Promise<{ userId: Id<"users">; sessionId: Id<"authSessions"> }> => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.credentialVersion !== args.version) throw new ConvexError("INVALID_CREDENTIALS");
    await activeLearnerProfile(ctx, user);
    // The version check and library-created session share one transaction.
    const result = await ctx.runMutation(internal.auth.store, { args: { type: "signIn", userId: user._id, generateTokens: false } });
    if (!result || typeof result !== "object" || !("userId" in result) || !("sessionId" in result)) throw new ConvexError("INVALID_CREDENTIALS");
    return { userId: result.userId, sessionId: result.sessionId };
  },
});
