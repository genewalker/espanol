import { v } from "convex/values";
import { familyQuery, guardianQuery } from "./lib/authorization";

export const viewer = familyQuery({
  args: {}, returns: v.object({ role: v.union(v.literal("guardian"), v.literal("learner")), nickname: v.string() }),
  handler: async (ctx) => ({ role: ctx.user.role!, nickname: ctx.user.role === "learner" ? ctx.profile!.nickname : ctx.user.nickname ?? "Förälder" }),
});

export const guardianViewer = guardianQuery({
  args: {},
  returns: v.object({ nickname: v.string(), role: v.literal("guardian") }),
  handler: async (ctx) => {
    return { nickname: ctx.user.nickname ?? "Förälder", role: "guardian" as const };
  },
});
