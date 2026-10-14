import { guardian } from "@/lib/guardian";
import { PracticeStart } from "@/components/practice/start";
import type { Id } from "../../../../../convex/_generated/dataModel";
export default async function PracticeListPage({ params }: { params: Promise<{ listId: string }> }) {
  await guardian();
  const { listId } = await params;
  return <PracticeStart listId={listId as Id<"vocabularyLists">} />;
}
