import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  users: defineTable({
    ...authTables.users.validator.fields,
    role: v.optional(v.union(v.literal("guardian"), v.literal("learner"))),
    nickname: v.optional(v.string()),
    guardianId: v.optional(v.id("users")),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_guardian", ["guardianId"]),
});
