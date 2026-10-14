import Link from "next/link";
import { guardian } from "@/lib/guardian";
import { GuardianContent } from "@/components/admin/shared";
import { ProgressDashboard } from "@/components/progress/overview";

export default async function GuardianProgressPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  await guardian();
  const { list } = await searchParams;
  return <main id="main" className="admin-main"><h1 className="text-3xl font-bold">Statistik och repetition</h1>
    <Link className="inline-flex min-h-11 items-center underline" href="/admin">Till föräldrasidan</Link>
    <GuardianContent><ProgressDashboard admin initialListId={list} /></GuardianContent>
  </main>;
}
