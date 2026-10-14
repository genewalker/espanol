import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { listFields, wordFields } from "./lib/vocabulary";

export default defineSchema({
  ...authTables,
  vocabularyLists: defineTable(listFields).index("by_guardian_status", ["guardianId", "status"]),
  words: defineTable(wordFields)
    .index("by_list_active", ["listId", "isActive"])
    .index("by_list_order", ["listId", "sortOrder"]),
  importBatches: defineTable({
    guardianId: v.id("users"), listId: v.id("vocabularyLists"), requestId: v.string(),
    fingerprint: v.string(), importedCount: v.number(), createdAt: v.number(),
  }).index("by_guardian_request", ["guardianId", "requestId"]),
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
