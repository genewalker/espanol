"use client";
import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { errorMessage, Notice } from "@/components/admin/shared";

export function ProfileForm({ nickname }: { nickname?: string }) {
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

