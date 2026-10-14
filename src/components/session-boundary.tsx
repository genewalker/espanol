"use client";

import { Component, type ReactNode } from "react";
import { isUnauthenticated } from "@/lib/auth-error";

export function SignInAgain() {
  return <div className="space-y-3">
    <p role="alert">Din inloggning har gått ut. Logga in igen för att fortsätta.</p>
    {/* A full navigation discards subscriptions and cached errors for the old session. */}
    <a className="primary-link" href="/sign-in">Logga in igen</a>
    <a className="inline-flex min-h-11 items-center underline" href="/sign-in/learner">Barnets inloggning</a>
  </div>;
}

// A JWT can still be valid after its server session has been revoked. Convex's
// Authenticated component alone cannot detect that. Keep backend checks strict
// and handle their expected session error without showing a broken page.
export class SessionBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (isUnauthenticated(this.state.error)) return <SignInAgain />;
      throw this.state.error;
    }
    return this.props.children;
  }
}
