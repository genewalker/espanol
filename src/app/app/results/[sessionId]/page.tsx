import { guardian } from "@/lib/guardian";
import { SessionResults } from "@/components/practice/results";
import type { Id } from "../../../../../convex/_generated/dataModel";
export default async function ResultsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  await guardian();
  const { sessionId } = await params;
  return <SessionResults sessionId={sessionId as Id<"practiceSessions">} />;
}
