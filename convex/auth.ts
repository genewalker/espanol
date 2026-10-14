import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { signInProfile } from "./lib/authPolicy";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { retrieveAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { activeLearnerProfile, LEARNER_PROVIDER, learnerCrypto, learnerPassword, learnerUsername } from "./lib/learnerAuth";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({ profile: signInProfile }), ConvexCredentials<DataModel>({
    id: LEARNER_PROVIDER, crypto: learnerCrypto,
    authorize: async (params, ctx) => {
      try {
        if (params.flow !== "signIn") throw new Error("Closed flow");
        const username = learnerUsername(params.username);
        const secret = learnerPassword(params.password);
        const expected = await ctx.runQuery(internal.learnerAccounts.loginVersion, { username });
        if (!expected) throw new Error("Unknown account");
        const { user } = await retrieveAccount<DataModel>(ctx, { provider: LEARNER_PROVIDER, account: { id: username, secret } });
        if (user._id !== expected.userId) throw new Error("Changed account");
        return await ctx.runMutation(internal.learnerAccounts.createSession, expected);
      } catch { throw new ConvexError("INVALID_CREDENTIALS"); }
    },
  })],
  signIn: { maxFailedAttempsPerHour: 5 },
  session: { totalDurationMs: 1000 * 60 * 60 * 12, inactiveDurationMs: 1000 * 60 * 60 },
  callbacks: {
    beforeSessionCreation: async (ctx, { userId }) => {
      const typed = ctx as unknown as QueryCtx;
      const user = await typed.db.get(userId);
      if (!user) throw new ConvexError("UNAUTHENTICATED");
      if (user.role === "learner") {
        await activeLearnerProfile(typed, user);
        const sessions = await typed.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).take(20);
        if (sessions.length >= 20) throw new ConvexError("INVALID_CREDENTIALS");
      }
    },
  },
  jwt: {
    customClaims: async (ctx, { userId, sessionId }) => {
      const typed = ctx as unknown as QueryCtx;
      const user = await typed.db.get(userId);
      if (!user) throw new ConvexError("UNAUTHENTICATED");
      if (user.role === "learner") {
        await activeLearnerProfile(typed, user);
        const session = await typed.db.get(sessionId);
        if (!session || session.userId !== userId || session.expirationTime <= Date.now()) throw new ConvexError("UNAUTHENTICATED");
        // Auth stores refresh history until sign-out. Bound it so a parent can
        // always revoke the child's <=20 sessions in one atomic reset.
        const tokens = await typed.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", sessionId)).take(101);
        if (tokens.length > 100) throw new ConvexError("UNAUTHENTICATED");
      }
      return {};
    },
  },
});
