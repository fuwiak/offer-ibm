"use strict";

const {
  parseHardwareQuery,
  textHasDecimalToken,
} = require("../../../utils/offerKp/hardwareQuery");

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

  it("drops accessory «с гайкой» and material «сталь 20» from bolt productTypes", () => {
    expect(
      parseHardwareQuery(
        "Болт М10х100 ГОСТ 7805-70 сталь 20 с гайкой М10×100 — 30 кг"
      ).productTypes
    ).toEqual(["болт"]);
  });

  it("parses washer diameter-only and d-form", () => {
    expect(parseHardwareQuery("Шайба DIN 433 M 6 оцинк").diameter).toBe("6");
    expect(parseHardwareQuery("Шайба DIN 433 M 6 оцинк").thread).toBeNull();
    expect(parseHardwareQuery("Шайба ГОСТ 11872-89 d 45 оцинк").diameter).toBe(
      "45"
    );
  });

  it("parses Ø20 colloquial washers and implies DIN 125 / 434", () => {
    const flat = parseHardwareQuery("Шайба плоская Ø20");
    expect(flat.diameter).toBe("20");
    expect(flat.dinNumbers).toContain("125");
    expect(flat.productTypes).toContain("шайба");

    const bevel = parseHardwareQuery("Шайба косая Ø20");
    expect(bevel.diameter).toBe("20");
    expect(bevel.dinNumbers).toContain("434");
  });

  it("parses nut property class 10 on «Гайка М20 10»", () => {
    const p = parseHardwareQuery("Гайка М20 10 3872 шт");
    expect(p.diameter).toBe("20");
    expect(p.strengthClass).toBe("10");
    expect(p.productTypes).toContain("гайка");
  });

  it("implies DIN 933 / 934 / 125 when RFQ omits the standard", () => {
    expect(parseHardwareQuery("Болт М16x50 8.8").dinNumbers).toContain("933");
    expect(parseHardwareQuery("Гайка М16").dinNumbers).toContain("934");
    expect(parseHardwareQuery("Шайба М16").dinNumbers).toContain("125");
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

  it("parses single-digit DIN 1 and pin DxL dimensions", () => {
    const p = parseHardwareQuery("штифт DIN 1 4х50 ГОСТ 3129-70 исп.2");
    expect(p.dinNumbers).toEqual(expect.arrayContaining(["1", "3129"]));
    expect(p.dimensions).toEqual({ a: "4", b: "50", c: null });
    expect(p.productTypes).toContain("штифт");
  });

  it("parses DIN 7978 pin with space-padded size 6x 30", () => {
    const p = parseHardwareQuery(
      "Штифт DIN 7978 6x 30 / ГОСТ 9464-79 исп. 1 (25)"
    );
    expect(p.dinNumbers).toEqual(expect.arrayContaining(["7978", "9464"]));
    expect(p.dimensions).toEqual({ a: "6", b: "30", c: null });
  });

  it("extracts ISO / ГОСТ Р ИСО numbers into dinNumbers", () => {
    expect(
      parseHardwareQuery("Винт M6x20 ГОСТ Р ИСО 1207-2013").dinNumbers
    ).toContain("1207");
    expect(
      parseHardwareQuery("Гайка М24 ГОСТ ISO 7040-2014").dinNumbers
    ).toContain("7040");
    expect(
      parseHardwareQuery(
        "Винт ГОСТ Р ИСО 10642-M5x16-12.9"
      ).dinNumbers
    ).toContain("10642");
  });

  it("parses colloquial «винт 10x25 10,9 дин 912-2000шт» as DIN 912 M10x25 10.9", () => {
    const p = parseHardwareQuery("винт 10x25 10,9 дин 912-2000шт");
    expect(p.dinNumbers).toContain("912");
    expect(p.thread).toEqual({ size: "10", length: "25" });
    expect(p.strengthClass).toBe("10.9");
    expect(p.productTypes).toEqual(["винт"]);
  });

  it("treats 10,9 and 10.9 as the same strength class token", () => {
    expect(textHasDecimalToken("винт 10,9 оцинк", "10.9")).toBe(true);
    expect(textHasDecimalToken("винт 10.9 оцинк", "10,9")).toBe(true);
    expect(textHasDecimalToken("винт 8.8 оцинк", "10.9")).toBe(false);
  });

  it("ranks 10.9 ahead of 8.8/12.9 for a precise DIN+MxL query", () => {
    const {
      isPreciseStructuredQuery,
      preferStrengthClassHits,
    } = require("../../../utils/offerKp/hardwareQuery");
    const parsed = parseHardwareQuery("винт 10x25 10,9 дин 912-2000шт");
    expect(isPreciseStructuredQuery(parsed)).toBe(true);
    const ranked = preferStrengthClassHits(
      [
        { id: 1, name: "Винт DIN  912 M 10x 25  8.8 оцинк" },
        { id: 2, name: "Винт DIN  912 M 10x 25 10.9 оцинк" },
        { id: 3, name: "Винт DIN  912 M 10x 25 12.9 оцинк" },
      ],
      parsed.strengthClass
    );
    expect(ranked[0].id).toBe(2);
  });

  it("parses decimal metric diameter M2,5x10", () => {
    const p = parseHardwareQuery("Винт ИСО 7045 М2,5 х 10 – 4.8");
    expect(p.dinNumbers).toContain("7045");
    expect(p.thread).toEqual({ size: "2.5", length: "10" });
    expect(p.productTypes).toEqual(["винт"]);
  });

  it("parses DIN letter suffixes (6928C / 980V)", () => {
    expect(parseHardwareQuery("Винт DIN 6928C M3,5x16").dinNumbers).toContain(
      "6928"
    );
    expect(parseHardwareQuery("Гайка DIN 980V M10").dinNumbers).toContain(
      "980"
    );
  });

  it("parses decimal pin DxL without stealing MxL tails", () => {
    expect(parseHardwareQuery("Штифт 3,5x40").dimensions).toEqual({
      a: "3.5",
      b: "40",
      c: null,
    });
    expect(parseHardwareQuery("Шайба 20×24×1,5").dimensions).toEqual({
      a: "20",
      b: "24",
      c: "1.5",
    });
    const mxl = parseHardwareQuery("Винт DIN 6928C M3,5x16");
    expect(mxl.dimensions).toBeNull();
    expect(mxl.thread).toEqual({ size: "3.5", length: "16" });
  });
});
