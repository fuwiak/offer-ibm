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

  it("parses washer diameter-only and d-form", () => {
    expect(parseHardwareQuery("Шайба DIN 433 M 6 оцинк").diameter).toBe("6");
    expect(parseHardwareQuery("Шайба DIN 433 M 6 оцинк").thread).toBeNull();
    expect(parseHardwareQuery("Шайба ГОСТ 11872-89 d 45 оцинк").diameter).toBe(
      "45"
    );
  });

  it("parses nut fine pitch M50x1,5 as pitch not length", () => {
    const p = parseHardwareQuery(
      "Гайка ГОСТ 11871-88 M 50x1,5 (6 шлицов) оцинк"
    );
    expect(p.diameter).toBe("50");
    expect(p.pitch).toBe("1.5");
    expect(p.thread).toBeNull();
  });

  it("keeps bolt MxL as thread length", () => {
    const p = parseHardwareQuery("Болт DIN 933 M 24x160 10.9 оцинк");
    expect(p.thread).toEqual({ size: "24", length: "160" });
    expect(p.pitch).toBeNull();
  });
});
