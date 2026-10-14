"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { VocabularyImport } from "./vocabulary-import";
import { errorMessage, Notice, statusLabels } from "./shared";

function MetadataForm({ list }: { list: Doc<"vocabularyLists"> }) {
  const update = useMutation(api.lists.update);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true); setError(""); setSuccess("");
    try {
      await update({ listId: list._id, title: String(data.get("title")), description: String(data.get("description")), testDate: String(data.get("testDate")) });
      setSuccess("Listans uppgifter sparades.");
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <form onSubmit={(e) => void save(e)} className="admin-panel">
    <h2 className="text-xl font-bold">Listans uppgifter</h2>
    <fieldset disabled={pending} className="space-y-3">
      <label className="field-label">Listans rubrik<input className="field" name="title" required maxLength={120} defaultValue={list.title} /></label>
      <label className="field-label">Beskrivning (valfri)<textarea className="field" name="description" maxLength={1000} defaultValue={list.description} /></label>
      <label className="field-label">Provdatum (valfritt)<input className="field" type="date" name="testDate" defaultValue={list.testDate} /></label>
      <Button type="submit">{pending ? "Sparar…" : "Spara uppgifter"}</Button>
    </fieldset>
    <Notice error={error} success={success} />
  </form>;
}

function WordCard({ word, archived }: { word: Doc<"words">; archived: boolean }) {
  const update = useMutation(api.words.updateWord);
  const setActive = useMutation(api.words.setActive);
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(word.contentVersion);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const aliases = (name: string) => String(data.get(name)).split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    setPending(true); setError("");
    try {
      await update({ wordId: word._id, expectedVersion: version, spanish: String(data.get("spanish")), swedish: String(data.get("swedish")), acceptedSpanish: aliases("acceptedSpanish"), acceptedSwedish: aliases("acceptedSwedish") });
      setEditing(false);
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  async function toggleActive() {
    setPending(true); setError("");
    try { await setActive({ wordId: word._id, isActive: !word.isActive }); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <li className="admin-panel">
    <p className="break-words font-bold"><span lang="es">{word.spanish}</span> — {word.swedish}</p>
    {!word.isActive && <p>Inaktiv – används inte i övningar.</p>}
    {editing ? <form onSubmit={(e) => void save(e)}>
      <fieldset disabled={pending || archived} className="space-y-3">
        <label className="field-label">Spanska<input name="spanish" className="field" defaultValue={word.spanish} required maxLength={5000} /></label>
        <label className="field-label">Svenska<input name="swedish" className="field" defaultValue={word.swedish} required maxLength={5000} /></label>
        <p>Alternativa svar: ett per rad, högst 10 per språk.</p>
        <label className="field-label">Alternativa svar på spanska<textarea name="acceptedSpanish" className="field" defaultValue={word.acceptedSpanish.join("\n")} /></label>
        <label className="field-label">Alternativa svar på svenska<textarea name="acceptedSwedish" className="field" defaultValue={word.acceptedSwedish.join("\n")} /></label>
        <div className="flex flex-wrap gap-2"><Button type="submit">Spara glosa</Button><Button variant="outline" onClick={() => { setEditing(false); setError(""); }}>Avbryt</Button></div>
      </fieldset>
    </form> : <>
      {!!word.acceptedSpanish.length && <p className="break-words">Spanska alternativ: {word.acceptedSpanish.join("; ")}</p>}
      {!!word.acceptedSwedish.length && <p className="break-words">Svenska alternativ: {word.acceptedSwedish.join("; ")}</p>}
      {!archived && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => { setVersion(word.contentVersion); setEditing(true); setError(""); }}>Redigera glosa</Button>
        <Button variant="outline" disabled={pending} onClick={() => void toggleActive()}>{word.isActive ? "Gör inaktiv" : "Återaktivera"}</Button>
      </div>}
    </>}
    <Notice error={error} />
  </li>;
}

export function ListEditor({ listId }: { listId: Id<"vocabularyLists"> }) {
  const list = useQuery(api.lists.getForAdmin, { listId });
  const words = useQuery(api.words.listForAdmin, { listId });
  const changeStatus = useMutation(api.lists.setStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  if (!list || !words) return <p role="status">Hämtar gloslistan…</p>;
  async function status(value: Doc<"vocabularyLists">["status"]) {
    setPending(true); setError("");
    try { await changeStatus({ listId, status: value }); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <>
    <h1 className="text-3xl font-bold break-words">{list.title}</h1>
    <div className="admin-panel">
      <p role="status" className="font-bold">{statusLabels[list.status]} · {list.activeWordCount} aktiva glosor</p>
      <p>{list.status === "published" ? "Listan går att öva på via Öva tillsammans på föräldrasidan." : list.status === "archived" ? "Arkiverade listor är dolda i övningsvyn. Återställ listan för att redigera glosor." : "Utkastet syns bara för dig. Publicera när glosorna är granskade."}</p>
      <div className="flex flex-wrap gap-2">
        {list.status === "draft" && <Button disabled={pending || !list.activeWordCount} onClick={() => void status("published")}>Publicera listan</Button>}
        {list.status === "published" && <Button variant="outline" disabled={pending} onClick={() => void status("draft")}>Återgå till utkast</Button>}
        {list.status !== "archived" ? <Button variant="outline" disabled={pending} onClick={() => void status("archived")}>Arkivera listan</Button> : <Button disabled={pending} onClick={() => void status("draft")}>Återställ till utkast</Button>}
      </div><Notice error={error} />
    </div>
    <MetadataForm list={list} />
    <section className="space-y-3" aria-label="Sparade glosor">
      <h2 className="text-xl font-bold">Glosor</h2>
      <p>Inaktiva glosor sparas men ingår inte i övningar. Om den sista aktiva glosan tas bort blir listan ett utkast.</p>
      <label className="check-label"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Visa även inaktiva ({list.wordCount - list.activeWordCount})</label>
      <ul className="space-y-3">{words.filter((word) => showInactive || word.isActive).map((word) => <WordCard key={word._id} word={word} archived={list.status === "archived"} />)}</ul>
      {!list.activeWordCount && <p>Inga aktiva glosor ännu.</p>}
    </section>
    {list.status !== "archived" && <details className="admin-panel"><summary className="min-h-11 cursor-pointer py-2 font-bold">Importera fler glosor</summary><VocabularyImport listId={listId} existing={words} /></details>}
  </>;
}
