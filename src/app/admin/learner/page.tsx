import Link from "next/link";
import { guardian } from "@/lib/guardian";
import { GuardianContent } from "@/components/admin/shared";
import { LearnerAccount } from "@/components/admin/learner-account";

export default async function LearnerPage() {
  await guardian();
  return <main id="main" className="admin-main">
    <h1 className="text-3xl font-bold">Barnets inloggning</h1>
    <Link className="inline-flex min-h-11 items-center underline" href="/admin">Till föräldrasidan</Link>
    <GuardianContent><LearnerAccount /></GuardianContent>
  </main>;
}
