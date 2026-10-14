"use client";
import { Button } from "@/components/ui/button";
export default function AdminError({ reset }: { reset: () => void }) {
  return <main id="main" className="admin-main"><h1 className="text-3xl font-bold">Vyn kunde inte hämtas</h1>
    <p role="alert">Kontrollera anslutningen eller logga in igen.</p><Button onClick={reset}>Försök igen</Button></main>;
}
