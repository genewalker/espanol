"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="mx-auto max-w-xl space-y-5 px-5 py-12">
    <h1 className="text-2xl font-bold">Sidan kunde inte öppnas</h1>
    <p>Kontrollera anslutningen och att du är inloggad med ett föräldrakonto.</p>
    <Button onClick={reset}>Försök igen</Button>
    <Link className="ml-4 inline-flex min-h-11 items-center underline" href="/sign-in">Till inloggning</Link>
  </main>;
}
