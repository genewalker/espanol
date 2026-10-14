export const badges = {
  first_session: { title: "Första passet", description: "Gör klart ett övningspass.", symbol: "✦" },
  ten_written: { title: "10 korrekta skrivsvar", description: "Svara rätt på tio skrivfrågor, över ett eller flera pass.", symbol: "✎" },
  weekly_challenge: { title: "Klarade veckans utmaning", description: "Gör klart utmaningen med minst 80 % rätt.", symbol: "★" },
} as const;
export type BadgeCode = keyof typeof badges;

export function answerXp(mode: "written" | "multiple_choice" | "flashcard", successful: boolean) {
  return successful ? { written: 10, multiple_choice: 6, flashcard: 2 }[mode] : 0;
}

export function challengePassed(correct: number, total: number) {
  return total > 0 && correct * 5 >= total * 4;
}
