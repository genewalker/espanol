import { ConvexError } from "convex/values";
import { scrypt } from "@noble/hashes/scrypt.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { GenericActionCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const LEARNER_PROVIDER = "learner-password";
export function learnerUsername(value: unknown) {
  if (typeof value !== "string") throw new ConvexError("Välj ett användarnamn med 4–32 bokstäver a–z, siffror eller bindestreck.");
  const name = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{3,31}$/.test(name)) throw new ConvexError("Välj ett användarnamn med 4–32 bokstäver a–z, siffror eller bindestreck.");
  return name;
}
export function learnerPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) throw new ConvexError("Lösenordet behöver vara 12–128 tecken. Välj gärna flera ord.");
  return value;
}

// Fixed, versioned format and work factors; never trust cost parameters in a hash.
// OWASP's 32 MiB scrypt configuration. The KDF itself is the existing noble library.
const prefix = "scrypt-v1";
const options = { N: 32768, r: 8, p: 3, dkLen: 32, maxmem: 34 * 1024 * 1024 };
export const learnerCrypto = {
  async hashSecret(secret: string) {
    learnerPassword(secret);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    // Synchronous KDF: async scrypt yields via timers, unavailable in mutations.
    return `${prefix}$${bytesToHex(salt)}$${bytesToHex(scrypt(secret, salt, options))}`;
  },
  async verifySecret(secret: string, hash: string) {
    learnerPassword(secret);
    if (!/^scrypt-v1\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(hash)) return false;
    const [, salt, expected] = hash.split("$");
    const actual = scrypt(secret, hexToBytes(salt), options);
    const expectedBytes = hexToBytes(expected);
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expectedBytes[i];
    return diff === 0;
  },
};

// Convex Auth 0.0.96's account helpers only call ctx.runMutation, although their
// public types request an ActionCtx. Convex 1.46 supports nested mutations in the
// SAME transaction. Keep this compatibility adapter covered by rollback tests.
export function authMutationContext(ctx: MutationCtx) {
  return ctx as unknown as GenericActionCtx<DataModel>;
}

export async function activeLearnerProfile(ctx: QueryCtx, user: Doc<"users">) {
  if (user.role !== "learner" || !user.guardianId) throw new ConvexError("FORBIDDEN");
  const guardian = await ctx.db.get(user.guardianId);
  const profile = await ctx.db.query("learnerProfiles").withIndex("by_learner", (q) => q.eq("learnerUserId", user._id)).unique();
  if (guardian?.role !== "guardian" || !profile || profile.guardianId !== guardian._id) throw new ConvexError("FORBIDDEN");
  if (profile.deleting) throw new ConvexError("UNAUTHENTICATED");
  return profile;
}
