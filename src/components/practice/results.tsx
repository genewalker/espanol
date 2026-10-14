"use client";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AnswerFeedback } from "./feedback";
import { RewardsPanel } from "./rewards";
import { modeLabels } from "./shared";

export function SessionResults({ sessionId }: { sessionId: Id<"practiceSessions"> }) {
  const result = useQuery(api.practice.getResults, { sessionId });
  if (!result) return <p role="status">Hämtar resultatet…</p>;
  return <div className="space-y-5">
    <h1 className="text-3xl font-bold">{result.session.status === "completed" ? "Passet är klart!" : "Passet avslutades i förtid"}</h1>
    <p className="break-words">{result.session.listTitle} · {result.session.answeredCount} av {result.session.questionCount} frågor besvarade</p>
    <div className="adventure-hero" aria-label="Sammanfattning">
      <p className="text-3xl font-bold">+{result.xpEarned} XP i passet</p>
      {!!result.objectiveCount && <p className="text-xl font-bold">Rätt: {result.correctCount} av {result.objectiveCount}</p>}
      {!!result.selfAssessedCount && <><p className="text-xl font-bold">Självskattning: {result.selfKnownCount} kunde av {result.selfAssessedCount} kort</p><p>Du bedömde själv dina flashcards. Det är inte samma sak som ett rättat skrivsvar.</p></>}
      <p>{result.session.answeredCount ? "Varje övning hjälper. Ta en paus eller prova ett nytt pass när det passar." : "Inga svar hann sparas. Du kan starta ett nytt pass när du vill."}</p>
    </div>
    {result.session.mode === "mixed_boss" && <section className="challenge-panel space-y-2" aria-label="Utmaningens resultat"><h2 className="text-xl font-bold">{result.challengePassed ? "Utmaningen klarad!" : "Du har tränat inför nästa utmaning"}</h2><p>{result.challengePassed ? "Minst 80 % rätt – fint jobbat! Du har märket för veckans utmaning." : "Märket kräver ett helt pass med minst 80 % rätt. Öva i din egen takt och prova igen när du vill."}</p></section>}
    <RewardsPanel sessionId={sessionId} />
    {!result.listAvailable && <p className="admin-panel">Listan är inte publicerad just nu. Dina sparade svar och belöningar finns kvar. Välj en annan gloslista för att fortsätta.</p>}
    <div className="flex flex-wrap gap-3">{result.listAvailable && <><Link className="primary-link" href={`/app/lists/${result.session.listId}`}>Öva listan igen</Link><Link className="inline-flex min-h-11 items-center underline" href={`/app/lists/${result.session.listId}?selection=difficult`}>Öva de svåra igen</Link></>}<Link className="inline-flex min-h-11 items-center underline" href={`/app/progress?list=${result.session.listId}`}>Se dina framsteg</Link><Link className="inline-flex min-h-11 items-center underline" href="/app">Välj gloslista</Link></div>
    {!!result.answers.length && <section className="space-y-3" aria-label="Dina svar"><h2 className="text-xl font-bold">Dina svar</h2><ol className="space-y-3">{result.answers.map((answer) => <li className="admin-panel" key={answer.index}>
      <h3 className="text-xl font-bold break-words"><span>{answer.index + 1}. </span><span lang={result.direction === "sv_to_es" ? "sv" : "es"}>{answer.prompt}</span></h3>
      <p>{modeLabels[answer.mode]}</p><AnswerFeedback feedback={answer.feedback} answerLanguage={result.direction === "sv_to_es" ? "es" : "sv"} />
    </li>)}</ol></section>}
  </div>;
}
