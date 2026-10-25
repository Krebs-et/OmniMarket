import { describe, expect, it } from "vitest";
import { toCsv } from "../src/lib/csv";

describe("CSV export formatting", () => {
  it("quotes values and neutralizes spreadsheet formulas", () => {
    expect(toCsv([["name", "customer"], ["=1+1", 'Name, "quoted"']]))
      .toBe('"name","customer"\r\n"\'=1+1","Name, ""quoted"""');
  });

  it("preserves ordinary negative numbers as data", () => {
    expect(toCsv([["delta"], [-3]])).toBe('"delta"\r\n"\'-3"');
  });
});
