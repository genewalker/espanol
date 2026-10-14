import { describe, expect, it } from "vitest";
import { gradeWritten, normalizeAnswer } from "../src/lib/vocabulary/normalize";
import { planQuestions, shuffle } from "../convex/lib/practicePlan";
import type { Doc, Id } from "../convex/_generated/dataModel";

describe("deterministic written grading", () => {
  it.each(["  EL   NIÑO  ", "el nin\u0303o", "El niño!", "el\nniño."])("accepts whitespace/case/NFC/terminal punctuation: %s", (answer) => {
    expect(gradeWritten(answer, "el niño", [])).toEqual({ isCorrect: true });
  });
  it.each([["si", "sí"], ["ano", "año"], ["arbol", "árbol"]])("preserves meaningful accents in %s / %s", (answer, expected) => {
    expect(gradeWritten(answer, expected, [])).toMatchObject({ isCorrect: false, hint: expect.stringContaining("tecknet") });
  });
  it("requires articles unless an explicit alias accepts the answer", () => {
    expect(gradeWritten("gato", "el gato", [])).toMatchObject({ isCorrect: false, hint: expect.stringContaining("artikeln") });
    expect(gradeWritten("gato", "el gato", ["gato"])).toEqual({ isCorrect: true });
    expect(gradeWritten("katt", "katten", ["katt"])).toEqual({ isCorrect: true });
  });
  it("does not autocorrect typos or strip internal punctuation", () => {
    expect(gradeWritten("gatto", "gato", [])).toEqual({ isCorrect: false });
    expect(normalizeAnswer("sí-no")).toBe("sí-no");
    expect(gradeWritten("si no", "sí-no", [])).toEqual({ isCorrect: false });
  });
});

function word(index: number, spanish: string, swedish: string, acceptedSpanish: string[] = []): Doc<"words"> {
  return { _id: `word${index}` as Id<"words">, _creationTime: 0, listId: "list" as Id<"vocabularyLists">, guardianId: "guardian" as Id<"users">,
    spanish, swedish, acceptedSpanish, acceptedSwedish: [], contentVersion: 1, sortOrder: index, isActive: true, createdAt: 0, updatedAt: 0 };
}
const colors = [word(0, "rojo", "röd"), word(1, "azul", "blå"), word(2, "verde", "grön"), word(3, "amarillo", "gul")];

describe("server question planning", () => {
  it("uses bounded distinct questions, both directions and immutable inputs", () => {
    const words = [...colors, word(4, " ROJO ", "röd")];
    const plan = planQuestions(words, "written", "es_to_sv", 10, () => 0.5);
    expect(plan).toHaveLength(4);
    expect(plan.find((q) => q.prompt === "verde")?.correctAnswer).toBe("grön");
    expect(words).toHaveLength(5);
    expect(new Set(plan.map((q) => q.wordId)).size).toBe(4);
  });
  it("offers unique options with no accepted alias as a distractor", () => {
    const plan = planQuestions([...colors, word(4, "lila", "lila", ["rojo"])], "multiple_choice", "sv_to_es", 5, () => 0.25);
    for (const question of plan) {
      if (question.mode !== "multiple_choice") throw new Error("Expected multiple choice");
      expect(question.options?.length).toBeGreaterThanOrEqual(3);
      const texts = question.options!.map((option) => normalizeAnswer(option.text));
      expect(new Set(texts).size).toBe(texts.length);
      expect(question.options!.find((option) => option.id === question.correctOptionId)?.text).toBe(question.correctAnswer);
      if (question.correctAnswer === "lila") expect(texts).not.toContain("rojo");
    }
  });
  it("falls back to written with fewer than three choices, including alias collisions", () => {
    expect(planQuestions(colors.slice(0, 2), "multiple_choice", "sv_to_es", 5).every((q) => q.mode === "written")).toBe(true);
    const plan = planQuestions([word(0, "rojo", "röd", ["azul"]), ...colors.slice(1, 3)], "multiple_choice", "sv_to_es", 5);
    expect(plan.find((q) => q.prompt === "röd")?.mode).toBe("written");
  });
  it("uses all correct-answer positions across controlled random sequences", () => {
    const positions = new Set<string>();
    for (const random of [0, 0.3, 0.4, 0.99]) {
      const plan = planQuestions(colors, "multiple_choice", "sv_to_es", 5, () => random);
      if (plan[0].mode !== "multiple_choice") throw new Error("Expected multiple choice");
      positions.add(plan[0].correctOptionId!);
    }
    expect(positions.size).toBe(4);
    expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });
});
