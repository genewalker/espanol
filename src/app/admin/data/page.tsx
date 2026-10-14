import Link from "next/link";
import { guardian } from "@/lib/guardian";
import { GuardianContent } from "@/components/admin/shared";
import { DataManagement } from "@/components/admin/data-management";

export default async function DataPage() {
  await guardian();
  return <main id="main" className="admin-main">
    <h1 className="text-3xl font-bold">Dina data</h1>
    <Link className="inline-flex min-h-11 items-center underline" href="/admin">Till föräldrasidan</Link>
    <GuardianContent><DataManagement /></GuardianContent>
  </main>;
}
