import { SignInForm } from "@/components/sign-in-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignInPage() {
  return <main id="main" className="mx-auto max-w-md px-5 py-12">
    <Card>
      <CardHeader><CardTitle><h1 className="text-2xl">Logga in som förälder</h1></CardTitle></CardHeader>
      <CardContent>
        {process.env.NEXT_PUBLIC_CONVEX_URL ? <SignInForm /> : <p>Inloggning är inte konfigurerad. Följ lokal installation i README.</p>}
        <p className="mt-6 text-sm text-muted-foreground">Endast för förberedda föräldrakonton. Barn ska inte registrera sig här.</p>
      </CardContent>
    </Card>
  </main>;
}
