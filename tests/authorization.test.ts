import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");

describe("Convex authorization", () => {
  it("exposes only public liveness to anonymous clients", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.health.check)).toEqual({ status: "ok" });
    await expect(t.query(api.users.guardianViewer)).rejects.toThrow("UNAUTHENTICATED");
  });
  it.each(["guardian", "learner", undefined] as const)("uses stored role %s instead of token claims", async (role) => {
    const t = convexTest(schema, modules);
    const { userId, sessionId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { role, nickname: "Alias", email: "private@example.test" });
      const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 60_000 });
      return { userId, sessionId };
    });
    const client = t.withIdentity({ subject: `${userId}|${sessionId}`, role: "guardian" });
    if (role === "guardian") {
      expect(await client.query(api.users.guardianViewer)).toEqual({ nickname: "Alias", role: "guardian" });
    } else {
      await expect(client.query(api.users.guardianViewer)).rejects.toThrow("FORBIDDEN");
    }
  });
  it("does not allow choosing another family using args", async () => {
    const t = convexTest(schema, modules);
    // A malicious client can bypass TypeScript, but not Convex argument validation.
    // @ts-expect-error deliberately invalid public arguments
    await expect(t.query(api.users.guardianViewer, { guardianId: "other-family", role: "guardian" })).rejects.toThrow();
  });
  it.each(["expired", "deleted", "other-user"])("denies %s sessions", async (kind) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { role: "guardian" });
      const otherId = await ctx.db.insert("users", { role: "guardian" });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: kind === "other-user" ? otherId : userId,
        expirationTime: Date.now() + (kind === "expired" ? -1000 : 60_000),
      });
      if (kind === "deleted") await ctx.db.delete(sessionId);
      return { userId, sessionId };
    });
    await expect(t.withIdentity({ subject: `${ids.userId}|${ids.sessionId}` }).query(api.users.guardianViewer)).rejects.toThrow("UNAUTHENTICATED");
  });
});
