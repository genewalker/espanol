import { ConvexError, type Value } from "convex/values";

export function normalizeGuardianEmail(value: unknown): string {
  if (typeof value !== "string") throw new ConvexError("INVALID_EMAIL");
  const email = value.trim().toLowerCase();
  // Only ordinary ASCII email identifiers in this local spike. No Unicode folding.
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email)) {
    throw new ConvexError("INVALID_EMAIL");
  }
  return email;
}

export function signInProfile(params: Record<string, Value | undefined>) {
  // Hiding sign-up in the UI is insufficient: deny every other flow server-side.
  if (params.flow !== "signIn") throw new ConvexError("REGISTRATION_CLOSED");
  if (typeof params.password !== "string" || params.password.length < 1 || params.password.length > 256) {
    throw new ConvexError("INVALID_CREDENTIALS");
  }
  return { email: normalizeGuardianEmail(params.email) };
}
