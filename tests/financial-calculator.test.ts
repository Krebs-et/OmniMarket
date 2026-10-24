import { describe, expect, it } from "vitest";
import { calculateAverageTicket, calculateMargin, calculateNetProfit } from "../src/domain/services/financial-calculator";

describe("financial calculator", () => {
  it("calculates the average ticket", () => expect(calculateAverageTicket(300, 3)).toBe(100));
  it("returns zero average ticket without orders", () => expect(calculateAverageTicket(300, 0)).toBe(0));
  it("calculates margin percentage", () => expect(calculateMargin(200, 150)).toBe(25));
  it("calculates net profit", () => expect(calculateNetProfit(200, 150)).toBe(50));
});
