import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { notFound } from "next/navigation";
import { guardian } from "@/lib/guardian";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { GuardianContent } from "@/components/admin/shared";
import { ListEditor } from "@/components/admin/list-editor";

export default async function ListPage({ params }: { params: Promise<{ listId: string }> }) {
  const { token } = await guardian();
  const { listId } = await params;
  try {
    await fetchQuery(api.lists.getForAdmin, { listId: listId as Id<"vocabularyLists"> }, { token });
  } catch {
    notFound();
  }
  return <main id="main" className="admin-main">
    <Link className="inline-flex min-h-11 items-center underline" href="/admin">Alla gloslistor</Link>
    <GuardianContent><ListEditor listId={listId as Id<"vocabularyLists">} /></GuardianContent>
  </main>;
}
