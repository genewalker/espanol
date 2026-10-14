import { createAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { normalizeGuardianEmail } from "./lib/authPolicy";
import { matchesConvexDeployment } from "../src/lib/convex-deployment.mjs";

// Privileged operator only, and explicitly bound to the configured pilot.
// setup-auth sets this binding using a dev-only deployment key.
export const createGuardian = internalAction({
  args: { email: v.string() }, returns: v.object({ email: v.string(), password: v.string() }),
  handler: async (ctx, args) => {
    const name = process.env.PILOT_DEPLOYMENT_NAME;
    if (!matchesConvexDeployment(name, process.env.CONVEX_CLOUD_URL)) throw new ConvexError("PILOT_NOT_CONFIGURED");
    const email = normalizeGuardianEmail(args.email);
    const password = crypto.randomUUID() + crypto.randomUUID();
    await createAccount(ctx, { provider: "password", account: { id: email, secret: password }, profile: { email, role: "guardian", nickname: "Förälder" }, shouldLinkViaEmail: false, shouldLinkViaPhone: false });
    return { email, password };
  },
});
