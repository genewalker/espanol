"use client";
import { useState, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { progressCounts } from "@/lib/practice/repetition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabels } from "@/components/admin/shared";

type Report = FunctionReturnType<typeof api.progress.myOverview>;
const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
function date(value: number) { return dateFormat.format(value); }

// Time is for presentation only. Scheduling and question selection always use
// server time in mutations. The UI refreshes due labels without a database write.
const subscribeClock = (onChange: () => void) => {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
};
const clockSnapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverClockSnapshot = () => null;
function useDisplayNow() { return useSyncExternalStore(subscribeClock, clockSnapshot, serverClockSnapshot); }

export function Recommendation({ listId }: { listId: Id<"vocabularyLists"> }) {
  const report = useQuery(api.progress.myOverview, { listId });
  const clock = useDisplayNow();
  if (!report || clock === null) return <p role="status">Hämtar repetitionsförslag…</p>;
  // A just-saved failure is due immediately, even between display-clock ticks.
  const now = Math.max(clock, ...report.words.map((word) => word.lastReviewedAt ?? 0));
  const counts = progressCounts(report.words, now);
  return <Card><CardHeader><CardTitle>Ditt nästa pass</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="font-bold break-words">{report.title}</p>
    <p>{counts.due} ord är dags att repetera · {counts.newWords} nya ord · {counts.mastered} sitter bra.</p>
    <p>Rekommenderat blandar repetition med nya ord när det finns. Du kan alltid välja hela listan.</p>
    <Link className="primary-link" href={`/app/lists/${listId}`}>Välj rekommenderat pass</Link>
    <p><Link className="inline-flex min-h-11 items-center underline" href={`/app/progress?list=${listId}`}>Se dina framsteg</Link></p>
  </CardContent></Card>;
}

function ReportView({ report, admin }: { report: Report; admin: boolean }) {
  const clock = useDisplayNow();
  if (clock === null) return <p role="status">Hämtar repetitionsdatum…</p>;
  const lastReviewed = Math.max(0, ...report.words.map((word) => word.lastReviewedAt ?? 0));
  const now = Math.max(clock, lastReviewed);
  const counts = progressCounts(report.words, now);
  const groups = [
    { title: "Behöver övas", levels: [0], count: counts.needsPractice },
    { title: "På väg", levels: [1, 2], count: counts.learning },
    { title: "Sitter bra", levels: [3], count: counts.mastered },
  ];
  return <div className="space-y-5">
    <h2 className="text-2xl font-bold break-words">{report.title}</h2>
    {admin && <p>{statusLabels[report.status]} · {report.nickname ?? "Ingen övningsprofil ännu"}</p>}
    <div className="admin-panel" aria-label="Listans framsteg">
      <p>{counts.answered} av {counts.total} aktiva ord har besvarats i aktuell version.</p>
      <p>{counts.due} ord är dags att repetera · {counts.difficult} svåra ord · {counts.newWords} nya ord.</p>
      <p>Senast övat på aktuell version: {lastReviewed ? date(lastReviewed) : "Inte ännu"}.</p>
    </div>
    {report.status === "published" && report.nickname && <div className="flex flex-wrap gap-3">
      <Link className="primary-link" href={`/app/lists/${report.listId}`}>Öva rekommenderat</Link>
      {counts.difficult > 0 && <Link className="primary-link" href={`/app/lists/${report.listId}?selection=difficult`}>Öva de svåra igen</Link>}
    </div>}
    {report.latestSession ? <section className="admin-panel" aria-label="Senaste avslutade passet">
      <h3 className="font-bold">Senaste avslutade passet</h3><p>{date(report.latestSession.completedAt)}</p>
      {report.latestSession.objective > 0 ? <p>Rättade frågor: {report.latestSession.correct} av {report.latestSession.objective} rätt ({Math.round(100 * report.latestSession.correct / report.latestSession.objective)} %).</p> : <p>Inga objektivt rättade frågor i detta pass.</p>}
      {report.latestSession.selfAssessed > 0 && <p>Självskattning: {report.latestSession.selfKnown} av {report.latestSession.selfAssessed} kort markerades Kunde.</p>}
      <Link className="inline-flex min-h-11 items-center underline" href={`/app/results/${report.latestSession.sessionId}`}>Visa passets resultat</Link>
      <p className="text-sm">Passets resultat bevaras även om en glosa ändras senare.</p>
    </section> : <p>Inget avslutat pass för den här listan ännu.</p>}
    {!report.words.length ? <p>Listan har inga aktiva ord.</p> : groups.map((group) => <section key={group.title} className="space-y-3" aria-label={group.title}>
      <h3 className="text-xl font-bold">{group.title} · {group.count}</h3>
      {!group.count ? <p>Inga ord i den här gruppen ännu.</p> : <ul className="space-y-3">{report.words.filter((word) => group.levels.includes(word.masteryLevel)).map((word) => <li className="admin-panel" key={word.wordId}>
        <h4 className="font-bold break-words">{admin && word.spanish !== undefined && <><span lang="es">{word.spanish}</span> – </>}{word.swedish}</h4>
        <p>Nivå {word.masteryLevel} av 3 · {word.attempts ? `${word.attempts} försök` : "Nytt ord"}</p>
        <p>{!word.attempts ? "Redo att öva nu." : word.nextReviewAt <= now ? "Dags att repetera nu." : `Nästa repetition: ${date(word.nextReviewAt)}.`}</p>
        {word.lastReviewedAt !== undefined && <p>Senast övat: {date(word.lastReviewedAt)}.</p>}
        {word.correct + word.wrong > 0 && <p>Rättade svar: {word.correct} rätt, {word.wrong} fel.</p>}
        {word.selfKnown + word.selfAgain > 0 && <p>Självskattning: {word.selfKnown} Kunde, {word.selfAgain} Behöver öva.</p>}
      </li>)}</ul>}
    </section>)}
    <details className="admin-panel"><summary className="min-h-11 cursor-pointer py-2 font-bold">Så fungerar nivåerna</summary>
      <p>Nivå 0 behöver övas, nivå 1–2 är på väg och nivå 3 sitter bra. Skrivsvar väger tyngst, flerval mindre och flashcards minst. Enbart självskattning kan högst nå nivå 1.</p>
      <p>Vid fel eller Behöver öva sjunker nivån ett steg och ordet kan repeteras direkt. Efter ett lyckat svar planeras nästa repetition om 1, 2, 4 eller 7 dagar, beroende på nivå. Det är ett övningsstöd, inte ett kunskapsbetyg.</p>
      <p>Båda språkriktningarna delar nivå. Tider visas i svensk tidszon. Ändras en glosa börjar nivån om; tidigare pass finns kvar.</p>
      <p>Repetitionsnivåer räknas från det att repetitionsfunktionen aktiverades. Äldre pass finns kvar i historiken.</p>
    </details>
  </div>;
}

export function ProgressDashboard({ admin = false, initialListId = "" }: { admin?: boolean; initialListId?: string }) {
  const home = useQuery(api.practice.home, admin ? "skip" : {});
  const owned = useQuery(api.lists.listMine, admin ? {} : "skip");
  const [selected, setSelected] = useState(initialListId);
  const lists = admin ? owned?.map((list) => ({ listId: list._id, title: list.title })) : home?.lists;
  const listId = lists?.find((list) => list.listId === selected)?.listId ?? lists?.[0]?.listId;
  const args = listId && (admin || home?.nickname) ? { listId } : "skip";
  const learnerReport = useQuery(api.progress.myOverview, admin ? "skip" : args);
  const guardianReport = useQuery(api.progress.guardianLearnerOverview, admin ? args : "skip");
  const report = admin ? guardianReport : learnerReport;
  if (!lists) return <p role="status">Hämtar gloslistor…</p>;
  if (!admin && !home?.nickname) return <p>Skapa din övningsprofil på <Link className="underline" href="/app">övningsstarten</Link> först.</p>;
  if (!lists.length) return <p>Inga gloslistor att visa ännu.{!admin && " Föräldern behöver publicera en lista först."}</p>;
  return <div className="space-y-5">
    <label className="field-label">Gloslista<select className="field" value={listId} onChange={(event) => setSelected(event.target.value)}>{lists.map((list) => <option key={list.listId} value={list.listId}>{list.title}</option>)}</select></label>
    {report ? <ReportView report={report} admin={admin} /> : <p role="status">Hämtar framsteg…</p>}
  </div>;
}
