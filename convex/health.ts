import { v } from "convex/values";
import { query } from "./_generated/server";

// Public liveness only. Never add user data or environment values here.
export const check = query({
  args: {},
  returns: v.object({ status: v.literal("ok") }),
  handler: async () => ({ status: "ok" as const }),
});
