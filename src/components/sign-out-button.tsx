"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <div>
    <Button variant="outline" disabled={pending} onClick={async () => {
      setPending(true);
      setError("");
      try {
        await signOut();
        router.replace("/sign-in");
        router.refresh();
      } catch {
        setError("Utloggningen misslyckades. Försök igen när anslutningen är tillbaka.");
      } finally { setPending(false); }
    }}>{pending ? "Loggar ut…" : "Logga ut"}</Button>
    <p role="alert">{error}</p>
  </div>;
}
