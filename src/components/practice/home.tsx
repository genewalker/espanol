"use client";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { modeLabels } from "./shared";
import { RewardsPanel } from "./rewards";
import { Recommendation } from "@/components/progress/overview";


export function PracticeHome() {
  const home = useQuery(api.practice.home);
  if (!home) return <p role="status">Hämtar dina gloslistor…</p>;
  if (home.deleting) return <div className="admin-panel"><h2 className="text-xl font-bold">Profilen håller på att raderas</h2><p>Föräldern behöver slutföra raderingen innan ni kan skapa en ny övningsprofil.</p><Link className="primary-link" href="/admin/data">Fortsätt på Dina data</Link></div>;
  if (!home.nickname) return <Card><CardHeader><CardTitle>Skapa en övningsprofil</CardTitle></CardHeader><CardContent><ProfileForm /></CardContent></Card>;
  return <div className="space-y-6">
    <div className="adventure-hero"><p className="text-sm font-bold uppercase tracking-widest">Ett ord i taget</p><h2 className="text-3xl font-bold break-words">Hej, {home.nickname}!</h2><p>Välj en liten upptäcktsfärd bland dina glosor. Du bestämmer takten.</p></div>
    {home.active && <Card><CardHeader><CardTitle>Fortsätt där du var</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="break-words">{home.active.listTitle} · {home.active.answeredCount} av {home.active.questionCount} besvarade</p>
      <Link className="primary-link" href={`/app/practice/${home.active.sessionId}`}>Fortsätt öva</Link>
      <p>Gör klart eller avsluta passet innan du startar ett nytt.</p>
    </CardContent></Card>}
    {!home.active && home.lists.length > 0 && <Recommendation listId={home.lists.find((list) => list.listId === home.recent[0]?.listId)?.listId ?? home.lists[0].listId} />}
    <section className="space-y-3" aria-labelledby="practice-lists-heading">
      <h2 id="practice-lists-heading" className="text-xl font-bold">Välj gloslista</h2>
      {!home.lists.length ? <div className="admin-panel"><h3 className="font-bold">Inga glosor ännu</h3><p>Föräldern behöver publicera en gloslista först.</p>{home.role === "guardian" && <Link className="inline-flex min-h-11 items-center underline" href="/admin">Till föräldrasidan</Link>}</div> :
        <ul className="space-y-3">{home.lists.map((list) => <li key={list.listId} className="admin-panel">
          <Link className="inline-flex min-h-11 items-center text-xl font-bold underline break-words" href={`/app/lists/${list.listId}`}>{list.title}</Link>
          <p>{list.activeWordCount} aktiva glosor{list.testDate ? ` · Prov ${list.testDate}` : ""}</p>
          {list.description && <p className="break-words">{list.description}</p>}
        </li>)}</ul>}
    </section>
    {!!home.recent.length && <section className="space-y-3" aria-label="Senaste passen"><h2 className="text-xl font-bold">Senaste passen</h2><ul>{home.recent.map((session) => <li key={session.sessionId}>
      <Link className="inline-flex min-h-11 items-center underline break-words" href={`/app/results/${session.sessionId}`}>{session.listTitle} · {modeLabels[session.mode]} · {session.status === "abandoned" ? "Avslutat i förtid" : "Klart"}</Link>
    </li>)}</ul></section>}
    <RewardsPanel />
    {home.role === "guardian" && <details className="admin-panel"><summary className="min-h-11 cursor-pointer py-2 font-bold">Ändra smeknamn</summary><ProfileForm nickname={home.nickname} /></details>}
  </div>;
}
