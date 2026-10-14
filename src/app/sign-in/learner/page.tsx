import Link from "next/link";
import { SignInForm } from "@/components/sign-in-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LearnerSignInPage() {
  return <main id="main" className="mx-auto max-w-md px-5 py-12">
    <Card><CardHeader><CardTitle><h1 className="text-2xl">Logga in och öva</h1></CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p>Använd kontot som din förälder har skapat åt dig.</p>
        {process.env.NEXT_PUBLIC_CONVEX_URL ? <SignInForm learner /> : <p>Inloggning är inte konfigurerad.</p>}
        <p className="text-sm">Glömt lösenordet? Be din förälder byta det på föräldrasidan.</p>
        <Link className="inline-flex min-h-11 items-center underline" href="/sign-in">Logga in som förälder</Link>
      </CardContent></Card>
  </main>;
}
