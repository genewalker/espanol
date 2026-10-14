"use client";
import { useConvexConnectionState, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function BackendStatus() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <p role="status" className="mt-6 text-sm">Utvecklingsmiljön är inte ansluten ännu. Se README för lokal start.</p>;
  }
  return <ConnectedStatus />;
}

function ConnectedStatus() {
  const health = useQuery(api.health.check);
  const connection = useConvexConnectionState();
  return <p role="status" className="mt-6 text-sm text-muted-foreground">
    {!connection.isWebSocketConnected && connection.connectionRetries > 0
      ? "Anslutningen är bruten. Vi försöker ansluta igen."
      : health?.status === "ok" ? "Anslutningen är klar." : "Ansluter…"}
  </p>;
}
