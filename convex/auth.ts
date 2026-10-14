import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { signInProfile } from "./lib/authPolicy";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({ profile: signInProfile })],
  signIn: { maxFailedAttempsPerHour: 5 },
  session: { totalDurationMs: 1000 * 60 * 60 * 12, inactiveDurationMs: 1000 * 60 * 60 },
});
