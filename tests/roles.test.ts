import { describe, expect, it } from "vitest";
import { can, parseRole } from "../src/domain/value-objects/role";

describe("role permissions", () => {
  it("grants admins every permission", () => {
    for (const permission of ["orders:read", "orders:write", "catalog:read", "catalog:write"] as const) {
      expect(can("admin", permission)).toBe(true);
    }
  });

  it("lets operators manage orders but not the catalog", () => {
    expect(can("operator", "orders:write")).toBe(true);
    expect(can("operator", "catalog:read")).toBe(true);
    expect(can("operator", "catalog:write")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(can("viewer", "orders:read")).toBe(true);
    expect(can("viewer", "orders:write")).toBe(false);
    expect(can("viewer", "catalog:write")).toBe(false);
  });

  it("falls back to viewer for unknown roles", () => {
    expect(parseRole("root")).toBe("viewer");
    expect(parseRole(undefined)).toBe("viewer");
    expect(parseRole("operator")).toBe("operator");
  });
});
