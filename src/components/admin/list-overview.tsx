"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { GuardianContent, statusLabels } from "./shared";

function Lists() {
  const lists = useQuery(api.lists.listMine);
  if (!lists) return <p role="status">Hämtar listor…</p>;
  if (!lists.length) return <div className="admin-panel"><h2 className="text-xl font-bold">Inga glosor ännu</h2><p>Skapa din första lista genom att klistra in glosor eller läsa in en CSV-fil.</p></div>;
  return <ul className="space-y-3">{[...lists].sort((a, b) => b.updatedAt - a.updatedAt).map((list) => <li key={list._id} className="admin-panel">
    <Link className="inline-flex min-h-11 items-center text-xl font-bold underline break-words" href={`/admin/lists/${list._id}`}>{list.title}</Link>
    <p>{statusLabels[list.status]} · {list.activeWordCount} aktiva glosor{list.testDate ? ` · Prov ${list.testDate}` : ""}</p>
    {list.description && <p className="whitespace-pre-wrap break-words">{list.description}</p>}
  </li>)}</ul>;
}

export function ListOverview() {
  return <GuardianContent><Lists /></GuardianContent>;
}
