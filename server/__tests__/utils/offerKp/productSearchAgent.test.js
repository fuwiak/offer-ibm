/* eslint-env jest, node */

const {
  extractSkuCodes,
  isSkuOnlyQuery,
  buildProductSearchText,
  hasHardwareSignals,
  isCatalogRelayRequest,
  runProductSearchAgent,
  mergeProductHits,
  sqlLimit,
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
        content: "Сталь шпоночная ГОСТ 8787-68 30x30x1000 / DIN 6880",
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
    expect(hasHardwareSignals("Сталь шпоночная ГОСТ 8787-68 30x30x1000")).toBe(
      true
    );
    expect(hasHardwareSignals("hello world")).toBe(false);
  });

  it("detects catalog relay requests", () => {
    expect(isCatalogRelayRequest("тогда передай [Каталог · purolat.com]")).toBe(
      true
    );
    expect(isCatalogRelayRequest("какая цена?")).toBe(false);
  });

  it("merges prior hardware messages for catalog relay follow-up", () => {
    const history = [
      {
        role: "user",
        content:
          "DIN 931 M10×50 8.8 цинк, DIN 934 M10 цинк, DIN 933 M8×30 8.8 цинк",
      },
    ];
    const text = buildProductSearchText(
      "тогда передай [Каталог · purolat.com]",
      {
        history,
      }
    );
    expect(text).toContain("DIN 931");
    expect(text).toContain("DIN 934");
  });

  it("never treats model-produced catalog blocks as a new search query", () => {
    const fabricated = `[Каталог · purolat.com]\nТовар: Гайка DIN 985 M36x2000\nЦена: 100 RUB\nSKU: FAKE-985`;
    const text = buildProductSearchText("переделай DOCX с актуальными ценами", {
      history: [{ role: "assistant", content: fabricated }],
    });

    expect(text).toBe("переделай DOCX с актуальными ценами");
    expect(text).not.toContain("FAKE-985");
  });

  it("does not query ShopDB for a forbidden price-source instruction", async () => {
    const result = await runProductSearchAgent({
      message: "Найди цену на сайте конкурента для болта DIN 933",
    });
    expect(result.products).toEqual([]);
    expect(result.strategies).toEqual([]);
    expect(result.signals.intent.primaryIntent).toBe("unsafe_or_forbidden");
  });
});

describe("productSearchAgent retrieval plumbing", () => {
  it("allows sqlLimit of 100 for Top-100 windows", () => {
    expect(sqlLimit(100)).toBe(100);
    expect(sqlLimit(50)).toBe(50);
  });

  it("keeps BM25/dense/RRF scores when merging SQL then RAG hits", () => {
    const merged = mergeProductHits([
      [
        {
          id: 1,
          name: "Болт",
          _matchSources: ["structured"],
          _bm25Score: null,
        },
      ],
      [
        {
          id: 1,
          name: "Болт",
          _matchSources: ["catalog_bm25", "catalog_dense"],
          _bm25Score: 8.2,
          _denseSimilarity: 0.77,
          _rrfScore: 0.03,
          _embeddingSimilarity: 0.71,
          _nameSimilarity: 0.9,
        },
      ],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]._bm25Score).toBe(8.2);
    expect(merged[0]._denseSimilarity).toBe(0.77);
    expect(merged[0]._rrfScore).toBe(0.03);
    expect(merged[0].shopMatchSources).toEqual(
      expect.arrayContaining(["structured", "catalog_bm25", "catalog_dense"])
    );
  });
});
