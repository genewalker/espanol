import { normalizeAnswer } from "../../src/lib/vocabulary/normalize";
import type { Doc } from "../_generated/dataModel";

export type Mode = "written" | "multiple_choice" | "flashcard";
export type Direction = "sv_to_es" | "es_to_sv";

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function planQuestions(words: Doc<"words">[], mode: Mode, direction: Direction, count: 5 | 10, random: () => number = Math.random) {
  const values = words.map((word) => ({
    wordId: word._id, contentVersion: word.contentVersion,
    prompt: direction === "sv_to_es" ? word.swedish : word.spanish,
    correctAnswer: direction === "sv_to_es" ? word.spanish : word.swedish,
    acceptedAnswers: direction === "sv_to_es" ? word.acceptedSpanish : word.acceptedSwedish,
  }));
  const unique = [...new Map(values.map((word) => [JSON.stringify([normalizeAnswer(word.prompt), normalizeAnswer(word.correctAnswer)]), word])).values()];
  return shuffle(unique, random).slice(0, count).map((word, questionIndex) => {
    if (mode !== "multiple_choice") return { ...word, mode, questionIndex };
    const accepted = new Set([word.correctAnswer, ...word.acceptedAnswers].map(normalizeAnswer));
    const distractors = new Map<string, string>();
    for (const candidate of unique) {
      const key = normalizeAnswer(candidate.correctAnswer);
      if (!accepted.has(key) && normalizeAnswer(candidate.prompt) !== normalizeAnswer(word.prompt)) distractors.set(key, candidate.correctAnswer);
    }
    if (distractors.size < 2) return { ...word, mode: "written" as const, questionIndex };
    const choices = shuffle([word.correctAnswer, ...shuffle([...distractors.values()], random).slice(0, 3)], random);
    // IDs are assigned AFTER shuffling. No identifier reveals which is correct.
    const options = choices.map((text, index) => ({ id: `choice-${index}`, text }));
    return { ...word, mode, questionIndex, options, correctOptionId: options.find((option) => option.text === word.correctAnswer)!.id };
  });
}
