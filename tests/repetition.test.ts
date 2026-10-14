import { describe, expect, it } from "vitest";
import { DAY, initialProgress, progressCounts, review, selectPracticeWords, type PracticeMode } from "../src/lib/practice/repetition";

const now = Date.UTC(2026, 9, 24, 12);
describe("deterministic repetition", () => {
  it("starts at level zero and counts new words separately from difficult and due", () => {
    const p = initialProgress(now);
    expect(p).toMatchObject({ attempts: 0, masteryLevel: 0, nextReviewAt: now });
    expect(progressCounts([p], now)).toMatchObject({ newWords: 1, difficult: 0, due: 0, needsPractice: 1 });
  });
  it.each([["written", 2], ["multiple_choice", 3], ["flashcard", 6]] as const)("requires %s's weighted exposures (%s) to reach level one", (mode, exposures) => {
    let p = initialProgress(now);
    for (let i = 1; i <= exposures; i++) {
      p = review(p, mode, true, now + i);
      expect(p.masteryLevel).toBe(i < exposures ? 0 : 1);
    }
    expect(p.nextReviewAt).toBe(now + exposures + 2 * DAY);
    expect(p.correct).toBe(mode === "flashcard" ? 0 : exposures);
    expect(p.selfKnown).toBe(mode === "flashcard" ? exposures : 0);
  });
  it("reaches levels 0–3 at 1/2/4/7 day intervals and saturates at three", () => {
    let p = initialProgress(now);
    const levels: number[] = [], intervals: number[] = [];
    for (let i = 0; i < 8; i++) {
      p = review(p, "written", true, now);
      levels.push(p.masteryLevel); intervals.push((p.nextReviewAt - now) / DAY);
    }
    expect(levels).toEqual([0, 1, 1, 2, 2, 3, 3, 3]);
    expect(intervals).toEqual([1, 2, 2, 4, 4, 7, 7, 7]);
  });
  it.each(["written", "multiple_choice", "flashcard"] as PracticeMode[])("a failed %s lowers one level, resets the streak and makes review due now", (mode) => {
    const previous = { ...initialProgress(now), masteryLevel: 2, consecutiveCorrect: 4, promotionPoints: 5 };
    const p = review(previous, mode, false, now);
    expect(p).toMatchObject({ masteryLevel: 1, promotionPoints: 0, consecutiveCorrect: 0, nextReviewAt: now, lastSuccessful: false });
    expect(review(initialProgress(now), mode, false, now).masteryLevel).toBe(0);
    expect(progressCounts([p], now)).toMatchObject({ due: 1, difficult: 1 });
  });
  it("does not present repeated self-assessment as objectively learned", () => {
    let p = initialProgress(now);
    for (let i = 0; i < 40; i++) p = review(p, "flashcard", true, now + i);
    expect(p).toMatchObject({ masteryLevel: 1, correct: 0, wrong: 0, selfKnown: 40, attempts: 40 });
    expect(progressCounts([p], now)).toMatchObject({ mastered: 0, learning: 1 });
  });
  it("is deterministic and uses elapsed UTC days across Swedish daylight-saving changes", () => {
    const p = review(initialProgress(now), "written", true, now);
    expect(review(initialProgress(now), "written", true, now)).toEqual(p);
    expect(p.nextReviewAt - p.lastReviewedAt!).toBe(DAY);
    expect(new Date(p.nextReviewAt).toISOString()).toBe("2026-10-25T12:00:00.000Z");
  });
  it("selects 60% due/difficult and 40% fresh, fills shortages without repeats", () => {
    const due = Array.from({ length: 8 }, (_, id) => ({ id, progress: { ...initialProgress(now), attempts: 1, masteryLevel: 1, nextReviewAt: now - DAY } }));
    const fresh = Array.from({ length: 8 }, (_, id) => ({ id: id + 10, progress: initialProgress(now) }));
    const rows = [...fresh, ...due];
    const picked = selectPracticeWords(rows, 10, "recommended", now);
    expect(picked.filter((row) => row.progress.attempts > 0)).toHaveLength(6);
    expect(picked.filter((row) => row.progress.attempts === 0)).toHaveLength(4);
    expect(new Set(picked.map((row) => row.id)).size).toBe(10);
    expect(selectPracticeWords(rows, 10, "recommended", now)).toEqual(picked);
    expect(selectPracticeWords(due, 10, "recommended", now)).toHaveLength(8);
    expect(selectPracticeWords(fresh, 10, "recommended", now)).toHaveLength(8);
  });
  it("difficult-only excludes new and strong words; due words outrank not-yet-due difficult words", () => {
    const rows = [
      { id: "new", progress: initialProgress(now) },
      { id: "difficult", progress: review(initialProgress(now), "written", true, now) },
      { id: "strong", progress: { ...initialProgress(now), attempts: 6, masteryLevel: 3, nextReviewAt: now + DAY } },
      { id: "due", progress: { ...initialProgress(now), attempts: 2, masteryLevel: 1, nextReviewAt: now - DAY } },
    ];
    expect(selectPracticeWords(rows, 5, "difficult", now).map((row) => row.id)).toEqual(["difficult"]);
    expect(selectPracticeWords(rows, 5, "recommended", now).map((row) => row.id)).toEqual(["due", "difficult", "new", "strong"]);
  });
});
