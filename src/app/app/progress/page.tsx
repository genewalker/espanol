import { guardian } from "@/lib/guardian";
import { ProgressDashboard } from "@/components/progress/overview";

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  await guardian();
  const { list } = await searchParams;
  return <><h1 className="text-3xl font-bold">Dina framsteg</h1><ProgressDashboard initialListId={list} /></>;
}
