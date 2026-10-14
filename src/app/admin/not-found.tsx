import Link from "next/link";

export default function NotFound() {
  return <main id="main" className="admin-main"><h1 className="text-3xl font-bold">Listan är inte tillgänglig</h1>
    <p>Kontrollera att du är inloggad på rätt föräldrakonto.</p><Link className="primary-link" href="/admin">Till gloslistorna</Link></main>;
}
