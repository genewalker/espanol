import { signedInViewer } from "@/lib/guardian";
import { PracticeHome } from "@/components/practice/home";
export default async function PracticeHomePage() {
  await signedInViewer();
  return <><h1 className="text-3xl font-bold">Dags för ett glosäventyr</h1><PracticeHome /></>;
}
