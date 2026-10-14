import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackendStatus } from "@/components/backend-status";

export default function Home() {
  return <main id="main" className="mx-auto max-w-3xl px-5 py-14 sm:py-24">
    <p className="mb-4 font-semibold text-primary">Svenska ↔ spanska</p>
    <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Glosäventyret</h1>
    <p className="mt-6 max-w-xl text-lg leading-relaxed">Små steg mot säkrare spanska. En lugn plats att öva veckans ord tillsammans.</p>
    <Card className="mt-10">
      <CardHeader><CardTitle className="text-2xl">Välkommen, förälder</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p>Grunden är på plats. Gloslistor och övningar kommer i nästa etapper.</p>
        <Link className="primary-link" href="/sign-in">Logga in som förälder</Link>
        <p className="text-sm text-muted-foreground">Barn behöver inte ange e-post eller skapa konto. Separat elevinloggning är inte aktiverad.</p>
      </CardContent>
    </Card>
    <BackendStatus />
  </main>;
}
