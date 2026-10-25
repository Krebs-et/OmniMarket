import { describe, expect, it } from "vitest";
import { getClientIp, isKnownApiPath } from "../src/lib/security";

describe("API security policy", () => {
  it("recognizes the implemented application and Auth.js routes", () => {
    expect(isKnownApiPath("/api/orders")).toBe(true);
    expect(isKnownApiPath("/api/orders/7fda3e1a-9b61-48bd-a0e8-d540f71894de/history")).toBe(true);
    expect(isKnownApiPath("/api/orders/status")).toBe(true);
    expect(isKnownApiPath("/api/auth/callback/google")).toBe(true);
  });

  it("does not treat proposed test-only endpoints as implemented routes", () => {
    expect(isKnownApiPath("/api/test/reset-data")).toBe(false);
    expect(isKnownApiPath("/api/orders/not-a-uuid/status")).toBe(false);
  });

  it("does not trust forwarded client IPs in production without the trusted proxy header", () => {
    const previousAppEnv = process.env.APP_ENV;
    process.env.APP_ENV = "production";
    try {
      expect(getClientIp({ headers: new Headers({ "x-forwarded-for": "198.51.100.12" }) })).toBe("unknown");
      expect(getClientIp({ headers: new Headers({ "x-real-ip": "198.51.100.12", "x-forwarded-for": "203.0.113.7" }) })).toBe("198.51.100.12");
    } finally {
      if (previousAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = previousAppEnv;
    }
  });
});
