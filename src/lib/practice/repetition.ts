export const DAY = 86_400_000;
export const REVIEW_DAYS = [1, 2, 4, 7] as const;
export type PracticeMode = "written" | "multiple_choice" | "flashcard";
export type Selection = "recommended" | "difficult" | "all";
export type Progress = {
  attempts: number; correct: number; wrong: number; selfKnown: number; selfAgain: number;
  consecutiveCorrect: number; promotionPoints: number; masteryLevel: number;
  nextReviewAt: number; lastReviewedAt?: number; lastSuccessful?: boolean;
};

export function initialProgress(now: number): Progress {
  return { attempts: 0, correct: 0, wrong: 0, selfKnown: 0, selfAgain: 0,
    consecutiveCorrect: 0, promotionPoints: 0, masteryLevel: 0, nextReviewAt: now };
}

// A successful written answer earns 3 promotion points, choice 2, self-rating 1.
// Six points promote one level; a failure resets the streak and promotion points.
// Self-rating alone may reach level 1, but cannot establish "Sitter bra".
export function review(previous: Progress, mode: PracticeMode, successful: boolean, now: number): Progress {
  const objective = mode !== "flashcard";
  let masteryLevel = previous.masteryLevel;
  let promotionPoints = successful ? previous.promotionPoints + (mode === "written" ? 3 : mode === "multiple_choice" ? 2 : 1) : 0;
  if (!successful) masteryLevel = Math.max(0, masteryLevel - 1);
  else if (promotionPoints >= 6 && masteryLevel < 3 && (objective || masteryLevel < 1)) {
    masteryLevel++;
    promotionPoints = 0;
  } else promotionPoints = Math.min(promotionPoints, 5);
  return {
    attempts: previous.attempts + 1,
    correct: previous.correct + Number(objective && successful), wrong: previous.wrong + Number(objective && !successful),
    selfKnown: previous.selfKnown + Number(!objective && successful), selfAgain: previous.selfAgain + Number(!objective && !successful),
    consecutiveCorrect: successful ? previous.consecutiveCorrect + 1 : 0, promotionPoints, masteryLevel,
    nextReviewAt: now + (successful ? REVIEW_DAYS[masteryLevel] * DAY : 0), lastReviewedAt: now, lastSuccessful: successful,
  };
}

export function isDifficult(progress: Progress) {
  return progress.attempts > 0 && (progress.masteryLevel === 0 || progress.lastSuccessful === false);
}

export function progressCounts(rows: readonly Progress[], now: number) {
  return {
    total: rows.length, answered: rows.filter((p) => p.attempts > 0).length,
    needsPractice: rows.filter((p) => p.masteryLevel === 0).length,
    learning: rows.filter((p) => p.masteryLevel === 1 || p.masteryLevel === 2).length,
    mastered: rows.filter((p) => p.masteryLevel === 3).length,
    due: rows.filter((p) => p.attempts > 0 && p.nextReviewAt <= now).length,
    difficult: rows.filter(isDifficult).length, newWords: rows.filter((p) => p.attempts === 0).length,
  };
}

// Input order breaks ties, keeping the same history and clock deterministic.
export function selectPracticeWords<T extends { progress: Progress }>(rows: readonly T[], count: number, selection: Selection, now: number): T[] {
  if (selection === "all") return rows.slice(0, count);
  const difficult = rows.filter((row) => isDifficult(row.progress));
  const rank = (a: T, b: T) => Number(b.progress.nextReviewAt <= now) - Number(a.progress.nextReviewAt <= now)
    || a.progress.masteryLevel - b.progress.masteryLevel || a.progress.nextReviewAt - b.progress.nextReviewAt;
  if (selection === "difficult") return difficult.sort(rank).slice(0, count);
  const repeat = rows.filter((row) => row.progress.attempts > 0 && (row.progress.nextReviewAt <= now || isDifficult(row.progress))).sort(rank);
  const fresh = rows.filter((row) => row.progress.attempts === 0);
  const picked = repeat.slice(0, Math.ceil(count * 0.6));
  picked.push(...fresh.slice(0, count - picked.length));
  const selected = new Set(picked);
  for (const row of [...repeat, ...rows]) {
    if (picked.length >= count) break;
    if (!selected.has(row)) { picked.push(row); selected.add(row); }
  }
  return picked;
}
