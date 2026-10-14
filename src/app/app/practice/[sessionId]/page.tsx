import { signedInViewer } from "@/lib/guardian";
import { PracticeRunner } from "@/components/practice/runner";
import type { Id } from "../../../../../convex/_generated/dataModel";
export default async function PracticePage({ params }: { params: Promise<{ sessionId: string }> }) {
  await signedInViewer();
  const { sessionId } = await params;
  return <PracticeRunner sessionId={sessionId as Id<"practiceSessions">} />;
}
