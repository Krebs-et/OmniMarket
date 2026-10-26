import { describe, expect, it } from "vitest";
import { can, parseRole } from "../src/domain/value-objects/role";
import { bulkUpdateStatusSchema } from "../src/application/dtos/order.dto";

describe("role permissions", () => {
  it("grants admins every permission", () => {
    for (const permission of ["orders:read", "orders:write", "catalog:read", "catalog:write", "observability:read"] as const) {
      expect(can("admin", permission)).toBe(true);
    }
    expect(can("operator", "observability:read")).toBe(false);
    expect(can("viewer", "observability:read")).toBe(false);
  });

  describe("bulk order status validation", () => {
    it("accepts at most 100 unique orders per update", () => {
      const ids = Array.from({ length: 100 }, (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`);
      expect(bulkUpdateStatusSchema.safeParse({ ids, status: "CONFIRMED" }).success).toBe(true);
      expect(bulkUpdateStatusSchema.safeParse({ ids: [...ids, "00000000-0000-4000-8000-000000000100"], status: "CONFIRMED" }).success).toBe(false);
    });
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
