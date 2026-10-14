import { guardian } from "@/lib/guardian";
import { PracticeStart } from "@/components/practice/start";
import type { Id } from "../../../../../convex/_generated/dataModel";
export default async function PracticeListPage({ params, searchParams }: { params: Promise<{ listId: string }>; searchParams: Promise<{ selection?: string }> }) {
  await guardian();
  const { listId } = await params;
  const { selection } = await searchParams;
  return <PracticeStart key={`${listId}:${selection}`} listId={listId as Id<"vocabularyLists">} initialSelection={selection === "difficult" || selection === "all" ? selection : "recommended"} />;
}
