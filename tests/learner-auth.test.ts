import { convexTest, type TestConvex } from "convex-test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { makeFunctionReference } from "convex/server";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { defaultOptions, parseVocabulary, prepareRows } from "../src/lib/vocabulary/parser";

const modules = { ...import.meta.glob("../convex/**/*.ts"), "../convex/testAuth.ts": () => import("./fixtures/learner-auth") };
const bootstrap = makeFunctionReference<"action", { email: string; password: string }, Id<"users">>("testAuth:bootstrapGuardian");
const rollbackCreate = makeFunctionReference<"mutation", { profileId: Id<"learnerProfiles">; password: string }, null>("testAuth:rollbackCreate");
const rollbackReset = makeFunctionReference<"mutation", { profileId: Id<"learnerProfiles">; newPassword: string }, null>("testAuth:rollbackReset");
const oldPassword = "synthetic-test-password-01";
const newPassword = "synthetic-test-password-02";
let publicKey: Awaited<ReturnType<typeof generateKeyPair>>["publicKey"];
beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  publicKey = pair.publicKey;
  vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(pair.privateKey));
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211");
  vi.stubEnv("AUTH_LOG_LEVEL", "ERROR");
  vi.stubEnv("AUTH_LOG_SECRETS", "false");
});
afterAll(() => vi.unstubAllEnvs());
type Test = TestConvex<typeof schema>;
async function verifiedClient(t: Test, token: string) {
  const { payload } = await jwtVerify(token, publicKey, { issuer: "http://127.0.0.1:3211", audience: "convex", algorithms: ["RS256"] });
  // convex-test has no JWT gateway: verify the real signature, then simulate it.
  return t.withIdentity({ subject: payload.sub!, role: "guardian" });
}
async function login(t: Test, password = oldPassword, username = "test-elev") {
  const result = await t.action(api.auth.signIn, { provider: "learner-password", params: { flow: "signIn", username, password, role: "guardian" } });
  expect(result.tokens).toBeTruthy();
  return { client: await verifiedClient(t, result.tokens!.token), tokens: result.tokens! };
}
async function fixture(provision = true) {
  const t = convexTest(schema, modules);
  const guardianId = await t.action(bootstrap, { email: "guardian@example.test", password: oldPassword });
  const signed = await t.action(api.auth.signIn, { provider: "password", params: { flow: "signIn", email: "guardian@example.test", password: oldPassword } });
  const guardian = await verifiedClient(t, signed.tokens!.token);
  const otherId = await t.action(bootstrap, { email: "other@example.test", password: oldPassword });
  const otherSigned = await t.action(api.auth.signIn, { provider: "password", params: { flow: "signIn", email: "other@example.test", password: oldPassword } });
  const other = await verifiedClient(t, otherSigned.tokens!.token);
  const profileId = await guardian.mutation(api.practice.saveProfile, { nickname: "Alias" });
  const otherProfileId = await other.mutation(api.practice.saveProfile, { nickname: "Annan" });
  const createArgs = { profileId, username: "test-elev", password: oldPassword, consent: true };
  if (provision) await guardian.mutation(api.learnerAccounts.create, createArgs);
  return { t, guardian, guardianId, other, otherId, profileId, otherProfileId, createArgs };
}
async function published(guardian: Awaited<ReturnType<typeof fixture>>["guardian"], title = "Färger") {
  const source = "rojo;röd\nazul;blå\nverde;grön";
  const { listId } = await guardian.mutation(api.imports.commitPreviewImport, { requestId: crypto.randomUUID(), target: { kind: "new", title }, source, options: defaultOptions, rows: prepareRows(parseVocabulary(source)) });
  await guardian.mutation(api.lists.setStatus, { listId, status: "published" });
  return listId;
}

describe("parent-managed learners with the production Convex Auth provider", () => {
  it("keeps existing progress, uses a separate email-free identity and salted scrypt hashes", async () => {
    const f = await fixture(false);
    await f.t.run((ctx) => ctx.db.patch(f.profileId, { totalXp: 123 }));
    await f.guardian.mutation(api.learnerAccounts.create, { ...f.createArgs, username: "Test-Elev" });
    const profile = (await f.t.run((ctx) => ctx.db.get(f.profileId)))!;
    expect(profile.totalXp).toBe(123);
    expect(profile.learnerUserId).not.toBe(f.guardianId);
    expect(await f.t.run((ctx) => ctx.db.get(profile.learnerUserId!))).toMatchObject({ role: "learner", guardianId: f.guardianId, credentialVersion: 1 });
    expect(await f.t.run((ctx) => ctx.db.get(profile.learnerUserId!))).not.toHaveProperty("email");
    const account = await f.t.run((ctx) => ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", profile.learnerUserId!)).unique());
    expect(account!.secret).toMatch(/^scrypt-v1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    const child = await login(f.t, oldPassword, " TEST-ELEV ");
    expect(await child.client.query(api.users.viewer)).toEqual({ role: "learner", nickname: "Alias" });
    expect(await child.client.query(api.rewards.mine)).toMatchObject({ totalXp: 123 });
  });

  it("completes practice on the same profile, visible to the parent, while excluding drafts and other families", async () => {
    const f = await fixture();
    const listId = await published(f.guardian);
    const foreign = await published(f.other);
    const draft = await f.guardian.mutation(api.lists.create, { title: "Draft" });
    const child = await login(f.t);
    expect((await child.client.query(api.practice.home)).lists.map((l) => l.listId)).toEqual([listId]);
    for (const denied of [foreign, draft]) await expect(child.client.query(api.practice.getList, { listId: denied })).rejects.toThrow("inte tillgänglig");
    const sessionId = await child.client.mutation(api.practice.startSession, { listId, mode: "written", direction: "sv_to_es", count: 5, requestId: crypto.randomUUID() });
    for (let i = 0; i < 3; i++) {
      const q = (await f.t.run((ctx) => ctx.db.query("practiceQuestions").withIndex("by_session_question", (q) => q.eq("sessionId", sessionId).eq("questionIndex", i)).unique()))!;
      await child.client.mutation(api.practice.submitAnswer, { sessionId, questionIndex: i, submission: { kind: "written", text: q.correctAnswer } });
      await child.client.mutation(api.practice.advanceQuestion, { sessionId, questionIndex: i });
    }
    expect(await f.guardian.query(api.practice.getResults, { sessionId })).toMatchObject({ correctCount: 3 });
    expect(await f.t.run((ctx) => ctx.db.get(sessionId))).toMatchObject({ guardianId: f.guardianId, profileId: f.profileId });
    expect(await child.client.query(api.rewards.mine)).toEqual(await f.guardian.query(api.rewards.mine));
    await expect(f.other.query(api.practice.getResults, { sessionId })).rejects.toThrow("NOT_FOUND");
  });

  it("rejects anonymous, child and foreign-parent account management and rejects self-registration", async () => {
    const f = await fixture();
    const child = await login(f.t);
    await expect(f.t.mutation(api.learnerAccounts.create, f.createArgs)).rejects.toThrow("UNAUTHENTICATED");
    await expect(f.other.mutation(api.learnerAccounts.resetPassword, { profileId: f.profileId, expectedVersion: 1, newPassword })).rejects.toThrow("NOT_FOUND");
    for (const ref of [api.lists.listMine, api.learnerAccounts.status, api.data.profile]) await expect(child.client.query(ref, {})).rejects.toThrow("FORBIDDEN");
    await expect(child.client.mutation(api.learnerAccounts.create, f.createArgs)).rejects.toThrow("FORBIDDEN");
    await expect(child.client.mutation(api.learnerAccounts.resetPassword, { profileId: f.profileId, expectedVersion: 1, newPassword })).rejects.toThrow("FORBIDDEN");
    await expect(child.client.mutation(api.practice.saveProfile, { nickname: "Spoof" })).rejects.toThrow("FORBIDDEN");
    for (const flow of ["signUp", "reset", "reset-verification"]) await expect(f.t.action(api.auth.signIn, { provider: "learner-password", params: { flow, username: "test-elev", password: oldPassword } })).rejects.toThrow("INVALID_CREDENTIALS");
  });

  it("revokes old passwords, JWT sessions and refresh tokens, keeps the parent session, and rejects stale resets", async () => {
    const f = await fixture();
    const first = await login(f.t);
    const second = await login(f.t);
    await f.guardian.mutation(api.learnerAccounts.resetPassword, { profileId: f.profileId, expectedVersion: 1, newPassword });
    await expect(login(f.t)).rejects.toThrow("INVALID_CREDENTIALS");
    for (const previous of [first, second]) {
      await expect(previous.client.query(api.practice.home)).rejects.toThrow("UNAUTHENTICATED");
      expect((await f.t.action(api.auth.signIn, { refreshToken: previous.tokens.refreshToken })).tokens).toBeNull();
    }
    const current = await login(f.t, newPassword);
    expect((await current.client.query(api.practice.home)).nickname).toBe("Alias");
    expect((await f.guardian.query(api.learnerAccounts.status))!.version).toBe(2);
    await expect(f.guardian.mutation(api.learnerAccounts.resetPassword, { profileId: f.profileId, expectedVersion: 1, newPassword: oldPassword })).rejects.toThrow("redan ändrats");
  });

  it("blocks password-verification and token-minting races across a reset", async () => {
    const f = await fixture();
    const expected = (await f.t.query(internal.learnerAccounts.loginVersion, { username: "test-elev" }))!;
    const reserved = await f.t.mutation(internal.learnerAccounts.createSession, expected);
    await f.guardian.mutation(api.learnerAccounts.resetPassword, { profileId: f.profileId, expectedVersion: 1, newPassword });
    await expect(f.t.mutation(internal.learnerAccounts.createSession, expected)).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(f.t.mutation(internal.auth.store, { args: { type: "signIn", ...reserved, generateTokens: true } })).rejects.toThrow("UNAUTHENTICATED");
    expect(await f.t.run((ctx) => ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", reserved.sessionId)).collect())).toEqual([]);
  });

  it("rolls back nested auth creation and credential/session changes when the outer transaction fails", async () => {
    const f = await fixture(false);
    await expect(f.guardian.mutation(rollbackCreate, { profileId: f.profileId, password: oldPassword })).rejects.toThrow("Injected");
    expect((await f.guardian.query(api.learnerAccounts.status))!.username).toBeNull();
    expect(await f.t.run((ctx) => ctx.db.query("users").withIndex("by_guardian", (q) => q.eq("guardianId", f.guardianId)).collect())).toEqual([]);
    expect(await f.t.run((ctx) => ctx.db.query("authAccounts").withIndex("providerAndAccountId", (q) => q.eq("provider", "learner-password")).collect())).toEqual([]);
    await f.guardian.mutation(api.learnerAccounts.create, f.createArgs);
    const previous = await login(f.t);
    await expect(f.guardian.mutation(rollbackReset, { profileId: f.profileId, newPassword })).rejects.toThrow("Injected");
    expect((await f.guardian.query(api.learnerAccounts.status))!.version).toBe(1);
    expect((await previous.client.query(api.practice.home)).nickname).toBe("Alias");
    await login(f.t);
    await expect(login(f.t, newPassword)).rejects.toThrow("INVALID_CREDENTIALS");
  });

  it("supports normal refresh and sign-out using Convex Auth", async () => {
    const f = await fixture(); const child = await login(f.t);
    const refreshed = await f.t.action(api.auth.signIn, { refreshToken: child.tokens.refreshToken });
    const client = await verifiedClient(f.t, refreshed.tokens!.token);
    expect((await client.query(api.practice.home)).role).toBe("learner");
    await client.action(api.auth.signOut, {});
    await expect(client.query(api.practice.home)).rejects.toThrow("UNAUTHENTICATED");
    expect((await f.t.action(api.auth.signIn, { refreshToken: refreshed.tokens!.refreshToken })).tokens).toBeNull();
  });

  it("allows only one concurrent reset and bounds account changes and stored sessions", async () => {
    const f = await fixture();
    const resets = await Promise.allSettled([
      f.guardian.mutation(api.learnerAccounts.resetPassword, { profileId: f.profileId, expectedVersion: 1, newPassword }),
      f.guardian.mutation(api.learnerAccounts.resetPassword, { profileId: f.profileId, expectedVersion: 1, newPassword: "other-test-password" }),
    ]);
    expect(resets.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await f.guardian.query(api.learnerAccounts.status))!.version).toBe(2);
    await f.t.run((ctx) => ctx.db.patch(f.profileId, { authWindowAt: Date.now(), authChanges: 10 }));
    await expect(f.guardian.mutation(api.learnerAccounts.resetPassword, { profileId: f.profileId, expectedVersion: 2, newPassword })).rejects.toThrow("För många");
    const expected = (await f.t.query(internal.learnerAccounts.loginVersion, { username: "test-elev" }))!;
    await f.t.run(async (ctx) => { for (let i = 0; i < 20; i++) await ctx.db.insert("authSessions", { userId: expected.userId, expirationTime: Date.now() + 60000 }); });
    await expect(f.t.mutation(internal.learnerAccounts.createSession, expected)).rejects.toThrow("INVALID_CREDENTIALS");
    expect(await f.t.run((ctx) => ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", expected.userId)).collect())).toHaveLength(20);
  });

  it("rejects a learner whose profile no longer belongs to its stored guardian", async () => {
    const f = await fixture(); const child = await login(f.t);
    await f.t.run((ctx) => ctx.db.patch(f.profileId, { guardianId: f.otherId }));
    await expect(child.client.query(api.practice.home)).rejects.toThrow("FORBIDDEN");
    await expect(login(f.t)).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(f.t.action(api.auth.signIn, { refreshToken: child.tokens.refreshToken })).rejects.toThrow("FORBIDDEN");
  });

  it("bounds refresh history so atomic revocation cannot grow without limit", async () => {
    const f = await fixture(); const child = await login(f.t);
    const expected = (await f.t.query(internal.learnerAccounts.loginVersion, { username: "test-elev" }))!;
    const session = (await f.t.run((ctx) => ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", expected.userId)).unique()))!;
    await f.t.run(async (ctx) => { for (let i = 0; i < 99; i++) await ctx.db.insert("authRefreshTokens", { sessionId: session._id, expirationTime: Date.now() + 60000 }); });
    await expect(f.t.action(api.auth.signIn, { refreshToken: child.tokens.refreshToken })).rejects.toThrow("UNAUTHENTICATED");
    expect(await f.t.run((ctx) => ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", session._id)).collect())).toHaveLength(100);
    await f.guardian.mutation(api.learnerAccounts.resetPassword, { profileId: f.profileId, expectedVersion: 1, newPassword });
    expect(await f.t.run((ctx) => ctx.db.get(session._id))).toBeNull();
    await login(f.t, newPassword);
  });

  it("limits five bad passwords, then lets the parent unlock through reset", async () => {
    const f = await fixture();
    for (let i = 0; i < 5; i++) await expect(login(f.t, "wrong-password-123")).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(login(f.t)).rejects.toThrow("INVALID_CREDENTIALS");
    await f.guardian.mutation(api.learnerAccounts.resetPassword, { profileId: f.profileId, expectedVersion: 1, newPassword });
    await login(f.t, newPassword);
  });
  it.each([undefined, "", "1234", "x".repeat(129)])("rejects missing/invalid credentials without opening a session (%#)", async (password) => {
    const f = await fixture();
    await expect(f.t.action(api.auth.signIn, { provider: "learner-password", params: { flow: "signIn", username: "test-elev", ...(password === undefined ? {} : { password }) } })).rejects.toThrow("INVALID_CREDENTIALS");
    const id = (await f.t.run((ctx) => ctx.db.get(f.profileId)))!.learnerUserId!;
    expect(await f.t.run((ctx) => ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", id)).collect())).toEqual([]);
  });

  it("prevents username transfer, concurrent duplicates, missing consent and weak credentials", async () => {
    const f = await fixture(false);
    await expect(f.guardian.mutation(api.learnerAccounts.create, { ...f.createArgs, consent: false })).rejects.toThrow("Bekräfta");
    await expect(f.guardian.mutation(api.learnerAccounts.create, { ...f.createArgs, password: "1234" })).rejects.toThrow("12–128");
    await expect(f.guardian.mutation(api.learnerAccounts.create, { ...f.createArgs, username: "invalid@name" })).rejects.toThrow("användarnamn");
    const results = await Promise.allSettled([f.guardian.mutation(api.learnerAccounts.create, f.createArgs), f.guardian.mutation(api.learnerAccounts.create, f.createArgs)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(f.other.mutation(api.learnerAccounts.create, { ...f.createArgs, profileId: f.otherProfileId })).rejects.toThrow("upptaget");
    expect(await f.t.run((ctx) => ctx.db.query("users").withIndex("by_guardian", (q) => q.eq("guardianId", f.guardianId)).collect())).toHaveLength(1);
  });

  it("blocks access immediately on deletion, removes auth in bounded batches and preserves parent and other-family data", async () => {
    const f = await fixture();
    await published(f.guardian);
    await f.other.mutation(api.learnerAccounts.create, { ...f.createArgs, profileId: f.otherProfileId, username: "other-elev" });
    const other = await login(f.t, oldPassword, "other-elev");
    const child = await login(f.t);
    const expected = (await f.t.query(internal.learnerAccounts.loginVersion, { username: "test-elev" }))!;
    const session = await f.t.run((ctx) => ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", expected.userId)).unique());
    await f.t.run(async (ctx) => { for (let i = 0; i < 105; i++) await ctx.db.insert("authRefreshTokens", { sessionId: session!._id, expirationTime: Date.now() + 10000 }); });
    await f.guardian.mutation(api.data.beginProfileDeletion, { profileId: f.profileId, confirmation: "RADERA" });
    await expect(child.client.query(api.practice.home)).rejects.toThrow("UNAUTHENTICATED");
    await expect(login(f.t)).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(f.t.action(api.auth.signIn, { refreshToken: child.tokens.refreshToken })).rejects.toThrow("UNAUTHENTICATED");
    let count = 0;
    while (!(await f.guardian.mutation(api.data.deleteProfileBatch, { profileId: f.profileId })).done) { if (++count > 20) throw new Error("Unbounded deletion"); }
    expect(count).toBeGreaterThan(2);
    expect(await f.t.run((ctx) => ctx.db.get(expected.userId))).toBeNull();
    expect(await f.t.run((ctx) => ctx.db.get(f.profileId))).toBeNull();
    expect(await f.t.run((ctx) => ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", expected.userId)).collect())).toEqual([]);
    expect(await f.t.run((ctx) => ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", session!._id)).collect())).toEqual([]);
    expect(await f.guardian.query(api.lists.listMine)).toHaveLength(1);
    expect((await other.client.query(api.practice.home)).nickname).toBe("Annan");
  });
});
