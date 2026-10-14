"use client";
import { Authenticated, AuthLoading, Unauthenticated, useConvexConnectionState } from "convex/react";
import type { ReactNode } from "react";
import { SessionBoundary, SignInAgain } from "@/components/session-boundary";

export const modeLabels = { written: "Skriv svaret", multiple_choice: "Flerval", flashcard: "Flashcards" };
export function PracticeContent({ children }: { children: ReactNode }) {
  const connection = useConvexConnectionState();
  return <>
    {!connection.isWebSocketConnected && connection.connectionRetries > 0 && <p role="status" className="admin-panel">Anslutningen är bruten. Vi försöker ansluta igen. Vänta på sparbekräftelsen innan du lämnar sidan.</p>}
    <AuthLoading><p role="status">Hämtar övningen…</p></AuthLoading>
    <Authenticated><SessionBoundary>{children}</SessionBoundary></Authenticated>
    <Unauthenticated><SignInAgain /></Unauthenticated>
  </>;
}
