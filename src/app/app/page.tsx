import { guardian } from "@/lib/guardian";
import { PracticeHome } from "@/components/practice/home";
export default async function PracticeHomePage() {
  await guardian();
  return <><h1 className="text-3xl font-bold">Dags för ett glosäventyr</h1><PracticeHome /></>;
}
