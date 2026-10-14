import { describe, expect, it, vi } from "vitest";
import { validatePilotEnvironment } from "../scripts/pilot-environment.mjs";
import { onRequestError } from "../src/instrumentation";
import { GET } from "../src/app/api/health/route";

const env = { VERCEL_ENV: "preview", PILOT_CONVEX_DEPLOYMENT: "dev:pilot-test-123", NEXT_PUBLIC_CONVEX_URL: "https://pilot-test-123.convex.cloud", NEXT_PUBLIC_CONVEX_SITE_URL: "https://pilot-test-123.convex.site", PILOT_APP_ORIGIN: "https://pilot.example.test" };
describe("pilot environment guards", () => {
  it("allows a matched preview frontend without any deploy credential", () => {
    expect(validatePilotEnvironment(env)).toEqual({ name: "pilot-test-123", origin: env.PILOT_APP_ORIGIN });
  });
  it("allows the reported regional URL pair for both frontend and backend", () => {
    const regional = { ...env, PILOT_CONVEX_DEPLOYMENT: "dev:harmless-finch-167", NEXT_PUBLIC_CONVEX_URL: "https://harmless-finch-167.eu-west-1.convex.cloud", NEXT_PUBLIC_CONVEX_SITE_URL: "https://harmless-finch-167.eu-west-1.convex.site" };
    expect(validatePilotEnvironment(regional).name).toBe("harmless-finch-167");
    expect(validatePilotEnvironment({ ...regional, CONVEX_DEPLOY_KEY: "dev:harmless-finch-167|test-key" }, { backend: true }).name).toBe("harmless-finch-167");
  });
  it.each([
    ["https://pilot-test-123.eu-west-1.convex.cloud", "https://pilot-test-123.convex.site"],
    ["https://pilot-test-123.eu-west-1.convex.cloud", "https://pilot-test-123.us-east-1.convex.site"],
    ["https://other-name-123.eu-west-1.convex.cloud", "https://other-name-123.eu-west-1.convex.site"],
    ["https://pilot-test-123.eu-west-1.convex.cloud.evil.test", "https://pilot-test-123.eu-west-1.convex.site.evil.test"],
    ["https://user@pilot-test-123.eu-west-1.convex.cloud", "https://user@pilot-test-123.eu-west-1.convex.site"],
    ["https://pilot-test-123.eu-west-1.convex.cloud/", "https://pilot-test-123.eu-west-1.convex.site/"],
    ["https://pilot-test-123.eu-west-1.convex.cloud:444", "https://pilot-test-123.eu-west-1.convex.site:444"],
    ["http://pilot-test-123.eu-west-1.convex.cloud", "http://pilot-test-123.eu-west-1.convex.site"],
    [undefined, undefined],
  ])("rejects mismatched or noncanonical regional URLs: %s, %s", (cloud, site) => {
    expect(() => validatePilotEnvironment({ ...env, NEXT_PUBLIC_CONVEX_URL: cloud, NEXT_PUBLIC_CONVEX_SITE_URL: site })).toThrow();
  });
  it.each([
    { VERCEL_ENV: "production" }, { VERCEL_ENV: "development" }, { VERCEL_TARGET_ENV: "production" },
    { PILOT_CONVEX_DEPLOYMENT: "prod:pilot-test-123" },
    { NEXT_PUBLIC_CONVEX_URL: "https://other.convex.cloud" }, { NEXT_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3211" },
    { PILOT_APP_ORIGIN: "https://pilot.example.test/path" }, { PILOT_APP_ORIGIN: "http://pilot.example.test" },
    { CONVEX_DEPLOY_KEY: "prod:private|secret" }, { CONVEX_SELF_HOSTED_URL: "https://elsewhere.test" },
  ])("rejects an unsafe or mismatched frontend configuration %j", (change) => {
    expect(() => validatePilotEnvironment({ ...env, ...change })).toThrow();
  });
  it("only permits a backend key for the declared dev deployment", () => {
    expect(() => validatePilotEnvironment({ ...env, CONVEX_DEPLOY_KEY: "dev:pilot-test-123|test-key" }, { backend: true })).not.toThrow();
    for (const key of [undefined, "prod:pilot-test-123|test-key", "dev:other-name|test-key", "preview:team:project|test-key", "legacy-secret", "dev:pilot-test-123|"]) {
      expect(() => validatePilotEnvironment({ ...env, CONVEX_DEPLOY_KEY: key }, { backend: true })).toThrow();
    }
  });
});

describe("minimal observability", () => {
  it("logs no error, request, headers, cookies, path, identifiers or child text", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      onRequestError(new Error("PRIVATE_ANSWER"), { path: "/app/PRIVATE_ID?nickname=PRIVATE_NAME", method: "POST", headers: { cookie: "PRIVATE_TOKEN" } }, { routerKind: "App Router", routePath: "/app/PRIVATE_ID", routeType: "render", revalidateReason: undefined });
      expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: "server_request_failed", service: "glosaventyret" }));
    } finally { log.mockRestore(); }
  });
  it("serves only non-cacheable liveness", async () => {
    const response = GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
