"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SignInAgain } from "@/components/session-boundary";
import { isUnauthenticated } from "@/lib/auth-error";
export default function PracticeError({ error, reset }: { error: Error; reset: () => void }) {
  if (isUnauthenticated(error)) return <SignInAgain />;
  return <div className="space-y-4"><h1 className="text-2xl font-bold">Övningen är inte tillgänglig</h1><p role="alert">Kontrollera anslutningen. Listan eller passet kan ha ändrats, eller tillhöra ett annat konto.</p><div className="flex flex-wrap gap-3"><Button onClick={reset}>Försök igen</Button><Link className="primary-link" href="/app">Till övningsstarten</Link></div></div>;
}
