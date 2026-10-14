"use client";

import { Authenticated, AuthLoading, Unauthenticated, useConvexConnectionState } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import type { ReactNode } from "react";

export function GuardianContent({ children }: { children: ReactNode }) {
  const connection = useConvexConnectionState();
  return <>{!connection.isWebSocketConnected && connection.connectionRetries > 0 && <p role="status" className="admin-panel">Anslutningen är bruten. Vi försöker ansluta igen. Vänta på sparbekräftelsen innan du lämnar sidan.</p>}
    <AuthLoading><p role="status">Ansluter…</p></AuthLoading>
    <Authenticated>{children}</Authenticated>
    <Unauthenticated><Link className="primary-link" href="/sign-in">Logga in igen</Link></Unauthenticated></>;
}

export function errorMessage(error: unknown) {
  return error instanceof ConvexError && typeof error.data === "string" && !/^[A-Z_]+$/.test(error.data)
    ? error.data : "Det gick inte att spara. Kontrollera anslutningen och försök igen.";
}

export function Notice({ error, success }: { error?: string; success?: string }) {
  return <>{error && <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">{error}</p>}
    {success && <p role="status" className="rounded-lg bg-secondary p-3">{success}</p>}</>;
}

export const statusLabels = { draft: "Utkast", published: "Publicerad", archived: "Arkiverad" };
