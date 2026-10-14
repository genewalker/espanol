// Loaded only by convex-test, never deployed or imported by the application.
import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, mutation } from "../../convex/_generated/server";
import { api } from "../../convex/_generated/api";
import type { DataModel } from "../../convex/_generated/dataModel";

export const bootstrapGuardian = action({
  args: { email: v.string(), password: v.string() }, returns: v.id("users"),
  handler: async (ctx, args) => (await createAccount<DataModel>(ctx, {
    provider: "password", account: { id: args.email, secret: args.password },
    profile: { role: "guardian", email: args.email }, shouldLinkViaEmail: false, shouldLinkViaPhone: false,
  })).user._id,
});
export const rollbackCreate = mutation({
  args: { profileId: v.id("learnerProfiles"), password: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(api.learnerAccounts.create, { ...args, username: "test-elev", consent: true });
    throw new Error("Injected transaction failure");
  },
});
export const rollbackReset = mutation({
  args: { profileId: v.id("learnerProfiles"), newPassword: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(api.learnerAccounts.resetPassword, { ...args, expectedVersion: 1 });
    throw new Error("Injected transaction failure");
  },
});
