import Link from "next/link";
import { signedInViewer } from "@/lib/guardian";
import { PracticeContent } from "@/components/practice/shared";
import { SignOutButton } from "@/components/sign-out-button";

export default async function PracticeLayout({ children }: { children: React.ReactNode }) {
  const { viewer } = await signedInViewer();
  return <main id="main" className="admin-main">
    <div className="flex flex-wrap gap-x-5"><Link className="inline-flex min-h-11 items-center underline" href="/app">Övningsstart</Link><Link className="inline-flex min-h-11 items-center underline" href="/app/progress">Dina framsteg</Link>{viewer.role === "guardian" && <Link className="inline-flex min-h-11 items-center underline" href="/admin">Föräldrasidan</Link>}</div>
    {viewer.role === "guardian" && <aside className="rounded-lg border border-input bg-secondary p-3 text-sm" aria-label="Öva tillsammans">
      <strong>Öva tillsammans med en förälder.</strong> Du använder förälderns inloggning, som också ger åtkomst till föräldrasidan. Föräldern behöver vara med under hela övningen.
    </aside>}
    <PracticeContent>{children}</PracticeContent>
    <SignOutButton learner={viewer.role === "learner"} />
  </main>;
}
