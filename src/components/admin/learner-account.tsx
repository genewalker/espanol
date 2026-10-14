"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/components/practice/profile-form";
import { errorMessage, Notice } from "./shared";

export function LearnerAccount() {
  const account = useQuery(api.learnerAccounts.status);
  const create = useMutation(api.learnerAccounts.create);
  const reset = useMutation(api.learnerAccounts.resetPassword);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !account) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password"));
    setError(""); setSuccess("");
    if (password !== data.get("confirmation")) { setError("Lösenorden behöver vara likadana."); return; }
    busy.current = true; setPending(true);
    try {
      if (account.username) {
        await reset({ profileId: account.profileId, expectedVersion: account.version, newPassword: password });
        setSuccess("Lösenordet är ändrat. Barnet behöver logga in igen på sina enheter.");
      } else {
        await create({ profileId: account.profileId, username: String(data.get("username")), password, consent: data.get("consent") === "on" });
        setSuccess("Barnets konto är klart. Ge barnet användarnamnet och lösenordet du valde.");
      }
      form.reset();
    } catch (err) { setError(errorMessage(err)); }
    finally { busy.current = false; setPending(false); }
  }

  if (account === undefined) return <p role="status">Hämtar barnets konto…</p>;
  if (!account) return <section className="admin-panel"><h2 className="text-xl font-bold">Börja med en övningsprofil</h2><ProfileForm /></section>;
  if (account.deleting) return <section className="admin-panel"><p>Profilen håller på att raderas. Inloggning och övning är låsta.</p><Link className="primary-link" href="/admin/data">Fortsätt raderingen</Link></section>;
  return <section className="admin-panel">
    <h2 className="text-xl font-bold break-words">{account.nickname}</h2>
    <p>Barnet kan öva på dina publicerade listor och se sina framsteg. Du sköter gloslistorna och kontot. Befintliga resultat, XP och märken följer med.</p>
    {account.username ? <>
      <p>Användarnamn: <strong className="break-all">{account.username}</strong></p>
      <Link className="inline-flex min-h-11 items-center underline" href="/sign-in/learner">Till barnets inloggning</Link>
      <h3 className="text-lg font-bold">Byt barnets lösenord</h3>
      <p>Det gamla lösenordet slutar fungera och barnet loggas ut från alla enheter. Du kan inte visa det nuvarande lösenordet.</p>
    </> : <p>Barnet behöver ingen e-postadress. Välj ett påhittat användarnamn utan fullständigt namn, födelsedatum eller andra personuppgifter.</p>}
    <form onSubmit={(event) => void submit(event)} className="space-y-4" aria-busy={pending}>
      {!account.username && <div><label className="field-label">Användarnamn<input className="field" name="username" required minLength={4} maxLength={32} pattern="[a-zA-Z](?:[a-zA-Z0-9]|-){3,31}" autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={pending} aria-describedby="username-help" /></label><p id="username-help">4–32 tecken: a–z, siffror och bindestreck. Börja med en bokstav.</p></div>}
      <label className="field-label">{account.username ? "Nytt lösenord" : "Barnets lösenord"}<input className="field" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={pending} aria-describedby="password-help" /></label>
      <p id="password-help">12–128 tecken. Välj gärna flera ord som barnet kan minnas. Använd ett annat lösenord än ditt eget.</p>
      <label className="field-label">Upprepa lösenordet<input className="field" name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={pending} /></label>
      {!account.username && <label className="flex min-h-11 items-start gap-3"><input className="mt-1 size-5 shrink-0" type="checkbox" name="consent" required disabled={pending} /><span>Jag är barnets vårdnadshavare och vill skapa och ansvara för kontot.</span></label>}
      <Button type="submit" disabled={pending}>{pending ? "Sparar…" : account.username ? "Byt lösenord" : "Skapa barnets konto"}</Button>
    </form>
    <Notice error={error} success={success} />
    <p>Du kan ta bort barnets konto och övningsdata under <Link className="underline" href="/admin/data">Dina data</Link>.</p>
  </section>;
}
