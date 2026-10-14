"use client";
import { useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { errorMessage, Notice, statusLabels } from "./shared";

export function DataManagement() {
  const client = useConvex();
  const lists = useQuery(api.lists.listMine);
  const profile = useQuery(api.data.profile);
  const begin = useMutation(api.data.beginProfileDeletion);
  const batch = useMutation(api.data.deleteProfileBatch);
  const [selected, setSelected] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const busy = useRef(false);

  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(""); setSuccess("");
    try { await action(); } catch (err) { setError(errorMessage(err)); }
    finally { busy.current = false; setPending(false); }
  }
  async function download(listId: Id<"vocabularyLists">) {
    const data = await client.query(api.data.exportList, { listId });
    const blob = new Blob([JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "glosaventyret-export.json";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSuccess("JSON-filen har skapats. Spara den på en privat plats.");
  }
  async function remove() {
    if (!profile) return;
    if (!profile.deleting) await begin({ profileId: profile.profileId, confirmation });
    // If this tab closes, the lock remains and the next visit offers Resume.
    while (!(await batch({ profileId: profile.profileId })).done) { /* bounded server batches */ }
    setConfirmation(""); setSuccess("Barnets konto, övningsprofil och resultat har raderats. Gloslistorna och föräldrakontot finns kvar.");
  }
  if (!lists || profile === undefined) return <p role="status">Hämtar dina data…</p>;
  const listId = lists.some((list) => list._id === selected) ? selected as Id<"vocabularyLists"> : lists[0]?._id;
  return <div className="space-y-6">
    <section className="admin-panel" aria-labelledby="export-heading">
      <h2 id="export-heading" className="text-xl font-bold">Exportera glosor och framsteg</h2>
      <p>Hämta en JSON-fil per lista, inklusive inaktiva glosor, accepterade svar och aktuell ordprogression. Profilens totala XP och märken följer med. Exporten innehåller inte inloggningsuppgifter eller historiska övningssvar.</p>
      {lists.length ? <>
        <label className="field-label">Gloslista<select className="field" value={listId} onChange={(e) => setSelected(e.target.value)} disabled={pending}>
          {lists.map((list) => <option key={list._id} value={list._id}>{list.title} · {statusLabels[list.status]}</option>)}
        </select></label>
        <Button disabled={pending || profile?.deleting} onClick={() => void run(() => download(listId!))}>Hämta JSON</Button>
      </> : <p>Inga gloslistor att exportera ännu.</p>}
      <p>Filen är en läsbar kopia. Den kan inte användas för automatisk återställning av kontot.</p>
    </section>
    <section className="admin-panel" aria-labelledby="delete-heading">
      <h2 id="delete-heading" className="text-xl font-bold">Radera övningsprofil</h2>
      {!profile ? <p>Ingen övningsprofil finns att radera.</p> : <>
        <p>Tar bort <strong className="break-words">{profile.nickname}</strong>, barnets eventuella inloggning, alla dess pass, sparade svar, ordprogression, XP och märken. Gloslistorna och föräldrakontot behålls. Raderingen kan inte ångras här.</p>
        <p>Exportera först om du vill behålla en kopia. Redan hämtade filer och äldre säkerhetskopior måste hanteras separat av den som sparat dem.</p>
        {profile.deleting ? <p role="status">Raderingen har påbörjats. Övning är låst tills den är klar. Fortsätt här om anslutningen bröts eller fliken stängdes.</p> :
          <label className="field-label">Skriv RADERA för att bekräfta<input className="field" autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={pending} /></label>}
        <Button variant="destructive" disabled={pending || (!profile.deleting && confirmation !== "RADERA")} onClick={() => void run(remove)}>
          {pending ? "Arbetar…" : profile.deleting ? "Fortsätt raderingen" : "Radera övningsprofilen"}
        </Button>
      </>}
    </section>
    <Notice error={error} success={success} />
  </div>;
}
