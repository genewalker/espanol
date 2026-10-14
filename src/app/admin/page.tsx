import Link from "next/link";
import { guardian } from "@/lib/guardian";
import { SignOutButton } from "@/components/sign-out-button";
import { ListOverview } from "@/components/admin/list-overview";

export default async function AdminPage() {
  const { viewer } = await guardian();
  return <main id="main" className="admin-main">
    <h1 className="text-3xl font-bold">Välkommen, {viewer.nickname}</h1>
    <p>Samla veckans glosor, granska dem och publicera när listan är klar.</p>
    <Link className="primary-link" href="/admin/lists/new">Skapa gloslista</Link>
    <ListOverview />
    <Link className="primary-link" href="/admin/progress">Statistik och repetition</Link>
    <Link className="primary-link" href="/app">Öva tillsammans</Link>
    <p>Övning sker med en närvarande förälder och förälderns inloggning.</p>
    <Link className="primary-link" href="/admin/learner">Barnets inloggning</Link>
    <Link className="inline-flex min-h-11 items-center underline" href="/admin/data">Dina data – export och radering</Link>
    <SignOutButton />
  </main>;
}
