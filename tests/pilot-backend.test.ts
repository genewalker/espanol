import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccount } from "@convex-dev/auth/server";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";

vi.mock("@convex-dev/auth/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@convex-dev/auth/server")>(),
  createAccount: vi.fn(),
}));
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("pilot guardian deployment binding", () => {
  it.each(["", ".eu-west-1"])("allows a matching deployment with region %s", async (region) => {
    vi.stubEnv("PILOT_DEPLOYMENT_NAME", "harmless-finch-167");
    vi.stubEnv("CONVEX_CLOUD_URL", `https://harmless-finch-167${region}.convex.cloud`);
    const result = await convexTest(schema, modules).action(internal.pilot.createGuardian, { email: "guardian@example.test" });
    expect(result.email).toBe("guardian@example.test");
    expect(createAccount).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({
      provider: "password", account: { id: result.email, secret: result.password },
      profile: { email: result.email, role: "guardian", nickname: "Förälder" },
    }));
  });
  it.each([
    undefined,
    "https://other-name-123.eu-west-1.convex.cloud",
    "https://harmless-finch-167.eu-west-1.convex.cloud.evil.test",
    "http://127.0.0.1:3210",
  ])("rejects an unbound backend before creating an account: %s", async (cloud) => {
    vi.stubEnv("PILOT_DEPLOYMENT_NAME", "harmless-finch-167");
    vi.stubEnv("CONVEX_CLOUD_URL", cloud);
    await expect(convexTest(schema, modules).action(internal.pilot.createGuardian, { email: "guardian@example.test" })).rejects.toThrow("PILOT_NOT_CONFIGURED");
    expect(createAccount).not.toHaveBeenCalled();
  });
});
