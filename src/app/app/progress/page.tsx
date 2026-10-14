import { guardian } from "@/lib/guardian";
import { RewardsPanel } from "@/components/practice/rewards";
import { ProgressDashboard } from "@/components/progress/overview";

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  await guardian();
  const { list } = await searchParams;
  return <><h1 className="text-3xl font-bold">Dina framsteg</h1><RewardsPanel /><ProgressDashboard initialListId={list} /></>;
}
