import Link from "next/link";
import { guardian } from "@/lib/guardian";
import { GuardianContent } from "@/components/admin/shared";
import { VocabularyImport } from "@/components/admin/vocabulary-import";

export default async function NewListPage() {
  await guardian();
  return <main id="main" className="admin-main">
    <Link className="inline-flex min-h-11 items-center underline" href="/admin">Alla gloslistor</Link>
    <h1 className="text-3xl font-bold">Skapa gloslista</h1>
    <GuardianContent><VocabularyImport /></GuardianContent>
  </main>;
}
