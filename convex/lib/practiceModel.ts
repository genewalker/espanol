import { v } from "convex/values";

export const modeValidator = v.union(v.literal("written"), v.literal("multiple_choice"), v.literal("flashcard"));
export const directionValidator = v.union(v.literal("sv_to_es"), v.literal("es_to_sv"));
export const sessionStatus = v.union(v.literal("active"), v.literal("completed"), v.literal("abandoned"));
export const optionValidator = v.object({ id: v.string(), text: v.string() });
export const submissionValidator = v.union(
  v.object({ kind: v.literal("written"), text: v.string() }),
  v.object({ kind: v.literal("multiple_choice"), optionId: v.string() }),
  v.object({ kind: v.literal("flashcard"), rating: v.union(v.literal("known"), v.literal("again")) }),
);
export const feedbackValidator = v.object({
  kind: v.union(v.literal("objective"), v.literal("self_assessed")),
  correctAnswer: v.string(), submittedText: v.string(),
  isCorrect: v.optional(v.boolean()), selfRating: v.optional(v.union(v.literal("known"), v.literal("again"))), hint: v.optional(v.string()),
});
export const sessionFields = {
  profileId: v.id("learnerProfiles"), guardianId: v.id("users"), listId: v.id("vocabularyLists"), listTitle: v.string(),
  requestId: v.string(), requestedCount: v.union(v.literal(5), v.literal(10)), mode: modeValidator, direction: directionValidator,
  status: sessionStatus, questionCount: v.number(), currentIndex: v.number(), answeredCount: v.number(),
  correctCount: v.number(), objectiveCount: v.number(), selfKnownCount: v.number(), selfAssessedCount: v.number(),
  createdAt: v.number(), completedAt: v.optional(v.number()),
};
export const questionFields = {
  sessionId: v.id("practiceSessions"), questionIndex: v.number(), wordId: v.id("words"), contentVersion: v.number(),
  mode: modeValidator, prompt: v.string(), correctAnswer: v.string(), acceptedAnswers: v.array(v.string()),
  options: v.optional(v.array(optionValidator)), correctOptionId: v.optional(v.string()), revealedAt: v.optional(v.number()),
};
export const answerFields = {
  sessionId: v.id("practiceSessions"), profileId: v.id("learnerProfiles"), questionIndex: v.number(),
  wordId: v.id("words"), contentVersion: v.number(), mode: modeValidator, direction: directionValidator,
  submission: submissionValidator, feedback: feedbackValidator, createdAt: v.number(),
};
export const sessionSummary = v.object({
  sessionId: v.id("practiceSessions"), listId: v.id("vocabularyLists"), listTitle: v.string(), mode: modeValidator,
  status: sessionStatus, questionCount: v.number(), answeredCount: v.number(), createdAt: v.number(),
});
export const publishedListView = v.object({ listId: v.id("vocabularyLists"), title: v.string(), description: v.optional(v.string()), testDate: v.optional(v.string()), activeWordCount: v.number() });
