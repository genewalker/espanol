import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { listFields, wordFields } from "./lib/vocabulary";
import { answerFields, questionFields, sessionFields } from "./lib/practiceModel";
import { badgeCode } from "./lib/rewards";
import { progressFields } from "./lib/progressModel";

export default defineSchema({
  ...authTables,
  achievements: defineTable({ profileId: v.id("learnerProfiles"), sessionId: v.id("practiceSessions"), code: badgeCode, earnedAt: v.number() }).index("by_profile_code", ["profileId", "code"]),
  wordProgress: defineTable(progressFields)
    .index("by_profile_word", ["profileId", "wordId"])
    .index("by_profile_list", ["profileId", "listId"]),
  // A supervised practice profile is NOT an auth identity/account.
  learnerProfiles: defineTable({ guardianId: v.id("users"), nickname: v.string(), totalXp: v.optional(v.number()), correctWrittenCount: v.optional(v.number()), createdAt: v.number() }).index("by_guardian", ["guardianId"]),
  practiceSessions: defineTable(sessionFields)
    .index("by_profile_status", ["profileId", "status"])
    .index("by_profile_created", ["profileId", "createdAt"])
    .index("by_profile_list_status_completed", ["profileId", "listId", "status", "completedAt"])
    .index("by_profile_request", ["profileId", "requestId"]),
  practiceQuestions: defineTable(questionFields).index("by_session_question", ["sessionId", "questionIndex"]),
  practiceAnswers: defineTable(answerFields).index("by_session_question", ["sessionId", "questionIndex"]),
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
