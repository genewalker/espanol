import { createAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { normalizeGuardianEmail } from "./lib/authPolicy";

// Operator-only bootstrap for local development. No public sign-up endpoint.
export const createGuardian = internalAction({
  args: { email: v.string() },
  returns: v.object({ email: v.string(), password: v.string() }),
  handler: async (ctx, args) => {
    const url = new URL(process.env.CONVEX_CLOUD_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      throw new ConvexError("LOCAL_DEVELOPMENT_ONLY");
    }
    const email = normalizeGuardianEmail(args.email);
    const password = crypto.randomUUID() + crypto.randomUUID();
    await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: password },
      profile: { email, role: "guardian", nickname: "Förälder" },
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: false,
    });
    // Returned once to the privileged operator; never logged or stored in plaintext.
    return { email, password };
  },
});
