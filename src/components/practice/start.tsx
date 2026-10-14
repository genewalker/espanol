"use client";
import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { errorMessage, Notice } from "@/components/admin/shared";

export function PracticeStart({ listId }: { listId: Id<"vocabularyLists"> }) {
  const list = useQuery(api.practice.getList, { listId });
  const home = useQuery(api.practice.home);
  const start = useMutation(api.practice.startSession);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const attempt = useRef<FunctionArgs<typeof api.practice.startSession> | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    if (!attempt.current) {
      const data = new FormData(event.currentTarget);
      attempt.current = { listId, requestId: crypto.randomUUID(), mode: String(data.get("mode")) as "written" | "multiple_choice" | "flashcard", direction: String(data.get("direction")) as "sv_to_es" | "es_to_sv", count: Number(data.get("count")) as 5 | 10 };
    }
    busy.current = true; setPending(true); setLocked(true); setError("");
    try { const sessionId = await start(attempt.current); router.push(`/app/practice/${sessionId}`); }
    catch (err) { setError(errorMessage(err)); }
    finally { busy.current = false; setPending(false); }
  }
  if (!list || !home) return <p role="status">Hämtar listan…</p>;
  return <div className="space-y-5">
    <h1 className="text-3xl font-bold break-words">{list.title}</h1>
    <p>{list.activeWordCount} aktiva glosor. Du får färre frågor om listan har färre unika glosor.</p>
    {home.active ? <div className="admin-panel"><p>Ett pass pågår redan.</p><Link className="primary-link" href={`/app/practice/${home.active.sessionId}`}>Fortsätt öva</Link></div> : <form onSubmit={(e) => void submit(e)} className="admin-panel">
      <fieldset disabled={locked} className="space-y-4">
        <label className="field-label">Övningsläge<select className="field" name="mode" defaultValue="written"><option value="written">Skriv svaret</option><option value="multiple_choice">Flerval</option><option value="flashcard">Flashcards – självskattning</option></select></label>
        <label className="field-label">Riktning<select className="field" name="direction" defaultValue="sv_to_es"><option value="sv_to_es">Svenska → spanska</option><option value="es_to_sv">Spanska → svenska</option></select></label>
        <label className="field-label">Antal frågor<select className="field" name="count" defaultValue="5"><option value="5">Kort pass – 5 frågor</option><option value="10">Normalt pass – 10 frågor</option></select></label>
      </fieldset>
      <p>Flerval blir skrivfrågor om det finns färre än tre olika svarsalternativ. Flashcards visar svaret när du vänder kortet.</p>
      <Notice error={error} />
      <Button type="submit" disabled={pending}>{pending ? "Startar…" : locked && error ? "Försök starta igen" : "Starta pass"}</Button>
    </form>}
  </div>;
}
