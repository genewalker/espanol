"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage, Notice } from "@/components/admin/shared";
import { modeLabels } from "./shared";
import { Recommendation } from "@/components/progress/overview";

function ProfileForm({ nickname }: { nickname?: string }) {
  const save = useMutation(api.practice.saveProfile);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true); setError(""); setSuccess("");
    try { await save({ nickname: String(data.get("nickname")) }); setSuccess("Smeknamnet sparades."); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <form onSubmit={(e) => void submit(e)} className="space-y-3">
    <p>En övningsprofil per familj. Använd ett påhittat smeknamn, inte barnets fullständiga namn.</p>
    <label className="field-label">Smeknamn<input className="field" name="nickname" defaultValue={nickname ?? "Äventyrare"} required maxLength={32} autoComplete="off" disabled={pending} /></label>
    <Button type="submit" disabled={pending}>{pending ? "Sparar…" : nickname ? "Spara smeknamn" : "Skapa övningsprofil"}</Button>
    <Notice error={error} success={success} />
  </form>;
}

export function PracticeHome() {
  const home = useQuery(api.practice.home);
  if (!home) return <p role="status">Hämtar dina gloslistor…</p>;
  if (!home.nickname) return <Card><CardHeader><CardTitle>Skapa en övningsprofil</CardTitle></CardHeader><CardContent><ProfileForm /></CardContent></Card>;
  return <div className="space-y-6">
    <h2 className="text-2xl font-bold break-words">Hej, {home.nickname}!</h2>
    {home.active && <Card><CardHeader><CardTitle>Fortsätt där du var</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="break-words">{home.active.listTitle} · {home.active.answeredCount} av {home.active.questionCount} besvarade</p>
      <Link className="primary-link" href={`/app/practice/${home.active.sessionId}`}>Fortsätt öva</Link>
      <p>Gör klart eller avsluta passet innan du startar ett nytt.</p>
    </CardContent></Card>}
    {!home.active && home.lists.length > 0 && <Recommendation listId={home.lists.find((list) => list.listId === home.recent[0]?.listId)?.listId ?? home.lists[0].listId} />}
    <section className="space-y-3" aria-labelledby="practice-lists-heading">
      <h2 id="practice-lists-heading" className="text-xl font-bold">Välj gloslista</h2>
      {!home.lists.length ? <div className="admin-panel"><h3 className="font-bold">Inga glosor ännu</h3><p>Föräldern behöver publicera en gloslista först.</p><Link className="inline-flex min-h-11 items-center underline" href="/admin">Till föräldrasidan</Link></div> :
        <ul className="space-y-3">{home.lists.map((list) => <li key={list.listId} className="admin-panel">
          <Link className="inline-flex min-h-11 items-center text-xl font-bold underline break-words" href={`/app/lists/${list.listId}`}>{list.title}</Link>
          <p>{list.activeWordCount} aktiva glosor{list.testDate ? ` · Prov ${list.testDate}` : ""}</p>
          {list.description && <p className="break-words">{list.description}</p>}
        </li>)}</ul>}
    </section>
    {!!home.recent.length && <section className="space-y-3" aria-label="Senaste passen"><h2 className="text-xl font-bold">Senaste passen</h2><ul>{home.recent.map((session) => <li key={session.sessionId}>
      <Link className="inline-flex min-h-11 items-center underline break-words" href={`/app/results/${session.sessionId}`}>{session.listTitle} · {modeLabels[session.mode]} · {session.status === "abandoned" ? "Avslutat i förtid" : "Klart"}</Link>
    </li>)}</ul></section>}
    <details className="admin-panel"><summary className="min-h-11 cursor-pointer py-2 font-bold">Ändra smeknamn</summary><ProfileForm nickname={home.nickname} /></details>
  </div>;
}
