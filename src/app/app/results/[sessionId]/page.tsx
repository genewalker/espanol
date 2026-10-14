import { signedInViewer } from "@/lib/guardian";
import { SessionResults } from "@/components/practice/results";
import type { Id } from "../../../../../convex/_generated/dataModel";
export default async function ResultsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  await signedInViewer();
  const { sessionId } = await params;
  return <SessionResults sessionId={sessionId as Id<"practiceSessions">} />;
}
