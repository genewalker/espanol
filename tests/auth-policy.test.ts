import { describe, expect, it } from "vitest";
import { normalizeGuardianEmail, signInProfile } from "../convex/lib/authPolicy";

describe("closed guardian sign-in", () => {
  it("normalizes adult email without accepting client roles", () => {
    expect(signInProfile({ flow: "signIn", email: " Parent@Example.test ", password: "secret", role: "guardian", guardianId: "forged" }))
      .toEqual({ email: "parent@example.test" });
  });
  it.each(["signUp", "reset", "reset-verification", "email-verification", "anything", undefined])("denies flow %s", (flow) => {
    expect(() => signInProfile({ flow, email: "parent@example.test", password: "long-enough-password" })).toThrow("REGISTRATION_CLOSED");
  });
  it.each([undefined, "", "x", "parent＠example.test", "a\n@example.test", "a".repeat(255) + "@example.test"])("rejects malformed identifier %s", (email) => {
    expect(() => normalizeGuardianEmail(email)).toThrow("INVALID_EMAIL");
  });
  it.each([undefined, "", "a".repeat(257)])("rejects invalid password input", (password) => {
    expect(() => signInProfile({ flow: "signIn", email: "p@example.test", password })).toThrow("INVALID_CREDENTIALS");
  });
});
