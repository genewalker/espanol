"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignInForm() {
  const { signIn, signOut } = useAuthActions();
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    data.set("flow", "signIn");
    try {
      // Clear any previous session before replacing credentials. Otherwise
      // protected queries can reuse its revoked token during reauthentication.
      await signOut();
      await signIn("password", data);
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Det gick inte att logga in. Kontrollera uppgifterna och anslutningen. Vänta en stund om du har försökt flera gånger.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
    <div className="space-y-2"><Label htmlFor="email">Din e-postadress</Label><Input id="email" name="email" type="email" autoComplete="username" maxLength={254} required /></div>
    <div className="space-y-2"><Label htmlFor="password">Lösenord</Label><Input id="password" name="password" type="password" autoComplete="current-password" maxLength={256} required /></div>
    <Button type="submit" disabled={pending} className="w-full">{pending ? "Loggar in…" : "Logga in"}</Button>
    <p role="alert" className="text-sm text-destructive">{error}</p>
  </form>;
}
