"use client";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { badges, type BadgeCode } from "@/lib/practice/rewards";

export function RewardsPanel({ sessionId }: { sessionId?: Id<"practiceSessions"> }) {
  const rewards = useQuery(api.rewards.mine);
  if (rewards === undefined) return <p role="status">Hämtar XP och märken…</p>;
  if (!rewards) return null;
  return <section className="reward-panel space-y-4" aria-label="XP och märken">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-bold">Ditt äventyr</h2>
      <p className="xp-total"><span aria-hidden="true">✦ </span>{rewards.totalXp} XP totalt</p>
    </div>
    <p>XP firar att du övar. Ordens nivåer visar vad du behöver träna på.</p>
    <ul className="grid gap-3 sm:grid-cols-3">
      {(Object.keys(badges) as BadgeCode[]).map((code) => {
        const badge = badges[code];
        const earned = rewards.badges.find((item) => item.code === code);
        return <li key={code} className={`badge-card ${earned ? "badge-earned" : ""}`}>
          <span className="badge-symbol" aria-hidden="true">{badge.symbol}</span>
          <h3 className="font-bold">{badge.title}</h3>
          <p className="text-sm">{badge.description}</p>
          <p className="text-sm font-semibold">{earned ? `${earned.sessionId === sessionId ? "Nytt märke! " : ""}✓ Intjänat` : code === "ten_written" ? `${Math.min(rewards.correctWrittenCount, 10)} av 10 skrivsvar` : "Att upptäcka"}</p>
        </li>;
      })}
    </ul>
    <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Så fungerar XP och märken</summary>
      <p>Rätt skrivsvar ger 10 XP, rätt flerval 6 XP och ett flashcard du själv skattar som Kunde ger 2 XP. Andra svar ger 0 XP, men hjälper dig att hitta vad du behöver öva på.</p>
      <p>Varje fråga ger XP en gång. Nya pass kan ge nya XP. Varje märke tjänas in en gång och stannar kvar. Äldre svar från tiden före XP räknas inte i efterhand.</p>
    </details>
  </section>;
}
