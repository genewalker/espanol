import { v } from "convex/values";
import { guardianQuery } from "./lib/authorization";

export const guardianViewer = guardianQuery({
  args: {},
  returns: v.object({ nickname: v.string(), role: v.literal("guardian") }),
  handler: async (ctx) => {
    return { nickname: ctx.user.nickname ?? "Förälder", role: "guardian" as const };
  },
});
