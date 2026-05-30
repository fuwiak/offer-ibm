/* eslint-env jest, node */

const {
  extractSkuCodes,
  isSkuOnlyQuery,
  buildProductSearchText,
  hasHardwareSignals,
} = require("../../../utils/offerKp/productSearchAgent");
const { parseHardwareQuery } = require("../../../utils/offerKp/hardwareQuery");

describe("productSearchAgent query parsing", () => {
  it("extracts SKU from art. prefix", () => {
    expect(extractSkuCodes("Арт. 009755100360002")).toEqual([
      "009755100360002",
    ]);
  });

  it("extracts SKU from bare numeric code", () => {
    expect(extractSkuCodes("087870000300030")).toEqual(["087870000300030"]);
  });

  it("detects SKU-only query", () => {
    const codes = extractSkuCodes("009755100360002");
    expect(isSkuOnlyQuery("009755100360002", codes)).toBe(true);
    expect(isSkuOnlyQuery("Арт. 009755100360002", codes)).toBe(true);
  });

  it("parses key steel GOST/DIN and dimensions", () => {
    const parsed = parseHardwareQuery(
      "Сталь шпоночная ГОСТ 8787-68 30x30x1000 / DIN 6880"
    );
    expect(parsed.dinNumbers).toEqual(expect.arrayContaining(["6880", "8787"]));
    expect(parsed.dimensions).toEqual({ a: "30", b: "30", c: "1000" });
    expect(parsed.productTypes).toEqual(
      expect.arrayContaining(["шпоночная", "сталь"])
    );
  });

  it("merges prior hardware message for SKU-only follow-up", () => {
    const history = [
      {
        role: "user",
        content:
          "Сталь шпоночная ГОСТ 8787-68 30x30x1000 / DIN 6880",
      },
    ];
    const text = buildProductSearchText("Арт. 087870000300030", { history });
    expect(text).toContain("30x30x1000");
    expect(text).toContain("087870000300030");
  });

  it("merges prior message for price-only follow-up", () => {
    const history = [
      {
        role: "user",
        content: "Штанга DIN 975 M36x2000 4.8 оцинк",
      },
    ];
    const text = buildProductSearchText("jaka cena?", { history });
    expect(text).toContain("DIN 975");
    expect(text).toContain("jaka cena?");
  });

  it("detects hardware signals in product names", () => {
    expect(
      hasHardwareSignals("Сталь шпоночная ГОСТ 8787-68 30x30x1000")
    ).toBe(true);
    expect(hasHardwareSignals("hello world")).toBe(false);
  });
});
