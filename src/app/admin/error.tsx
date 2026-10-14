"use client";
import { Button } from "@/components/ui/button";
import { SignInAgain } from "@/components/session-boundary";
import { isUnauthenticated } from "@/lib/auth-error";
export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  if (isUnauthenticated(error)) return <main id="main" className="admin-main"><SignInAgain /></main>;
  return <main id="main" className="admin-main"><h1 className="text-3xl font-bold">Vyn kunde inte hämtas</h1>
    <p role="alert">Kontrollera anslutningen eller logga in igen.</p><Button onClick={reset}>Försök igen</Button></main>;
}
