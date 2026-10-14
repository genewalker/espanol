import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminPage() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) redirect("/sign-in");
  const token = await convexAuthNextjsToken();
  if (!token) redirect("/sign-in");
  const viewer = await fetchQuery(api.users.guardianViewer, {}, { token });
  return <main id="main" className="mx-auto max-w-2xl space-y-6 px-5 py-12">
    <h1 className="text-3xl font-bold">Välkommen, {viewer.nickname}</h1>
    <Card><CardHeader><CardTitle>Inga glosor ännu</CardTitle></CardHeader>
      <CardContent><p>Din föräldrainloggning fungerar. Att lägga in gloslistor blir nästa steg i Glosäventyret.</p></CardContent>
    </Card>
    <p>Elevinloggning och övningar är ännu inte aktiverade.</p>
    <SignOutButton />
  </main>;
}
