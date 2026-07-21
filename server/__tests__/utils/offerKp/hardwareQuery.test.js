"use strict";

const { parseHardwareQuery } = require("../../../utils/offerKp/hardwareQuery");

describe("parseHardwareQuery — productTypes / STANDARD_IMPLIES_TYPE", () => {
  it("fills in the DIN-implied type when the customer named no type at all", () => {
    expect(parseHardwareQuery("DIN 933 M10x80").productTypes).toEqual([
      "болт",
    ]);
  });

  it("keeps an explicitly-named type as-is (no DIN-implied union)", () => {
    // Regression: the implied type used to be OR-ed in on top of an explicit
    // customer type, so "гайка DIN 933" (nut) matched a bolt product as
    // "exact" via analogRules.productTypeMatches's .some() check.
    expect(parseHardwareQuery("гайка DIN 933 M10x80").productTypes).toEqual([
      "гайка",
    ]);
  });

  it("keeps a colloquial explicit type as-is even though it differs from the DIN-canonical type", () => {
    expect(parseHardwareQuery("винт DIN 933 M10x80").productTypes).toEqual([
      "винт",
    ]);
  });

  it("matches an explicitly-named canonical type without duplicating it", () => {
    expect(parseHardwareQuery("болт DIN 933 M10x80").productTypes).toEqual([
      "болт",
    ]);
  });
});
