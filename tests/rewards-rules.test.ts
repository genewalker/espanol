import { describe, expect, it } from "vitest";
import { challengePassed } from "../src/lib/practice/rewards";
import { planChallenge } from "../convex/lib/practicePlan";
import type { Doc, Id } from "../convex/_generated/dataModel";

function words(count: number): Doc<"words">[] {
  return Array.from({ length: count }, (_, index) => ({
    _id: `word${index}` as Id<"words">, _creationTime: 0, listId: "list" as Id<"vocabularyLists">, guardianId: "guardian" as Id<"users">,
    spanish: `es${index}`, swedish: `sv${index}`, acceptedSpanish: [], acceptedSwedish: [], contentVersion: 1, sortOrder: index, isActive: true, createdAt: 0, updatedAt: 0,
  }));
}
describe("challenge planning and cutoff", () => {
  it("uses exact fractions without rounding an unsuccessful result up", () => {
    for (let count = 1; count <= 10; count++) {
      const needed = Math.ceil(count * 0.8);
      expect(challengePassed(needed, count)).toBe(true);
      expect(challengePassed(needed - 1, count)).toBe(false);
    }
    expect(challengePassed(0, 0)).toBe(false);
  });
  it.each([0, 1, 2, 3, 5, 9, 10, 15])("plans %s available words, with at least half written and no duplicates", (count) => {
    const input = words(count);
    for (const random of [0, 0.49, 0.99]) {
      const plan = planChallenge(input, "es_to_sv", () => random);
      expect(plan).toHaveLength(Math.min(count, 10));
      expect(plan.filter((q) => q.mode === "written").length).toBeGreaterThanOrEqual(Math.ceil(plan.length / 2));
      expect(new Set(plan.map((q) => q.wordId)).size).toBe(plan.length);
      expect(plan.every((q, index) => q.questionIndex === index && q.prompt.startsWith("es") && q.correctAnswer.startsWith("sv"))).toBe(true);
      if (count < 3) expect(plan.every((q) => q.mode === "written")).toBe(true);
      else expect(plan.some((q) => q.mode === "multiple_choice")).toBe(true);
    }
    expect(input).toHaveLength(count);
  });
});
