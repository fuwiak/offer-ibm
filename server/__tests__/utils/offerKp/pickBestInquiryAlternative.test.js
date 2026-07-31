/* eslint-env jest, node */

const {
  pickBestInquiryAlternative,
  pickBestPricedSku,
  resolveMatchConcurrency,
  enforceExactGroundingContract,
} = require("../../../utils/offerKp/matchInquiryLines");
const { STATUS } = require("../../../utils/offerKp/analogRules");

describe("pickBestInquiryAlternative", () => {
  it("prefers exact size match over cheaper wrong size", () => {
    const best = pickBestInquiryAlternative([
      {
        productId: "1",
        name: "Болт M10x100",
        price: 45,
        matchType: "exact",
        status: STATUS.NEEDS_REVIEW,
      },
      {
        productId: "2",
        name: "Болт M6x25",
        price: 18.5,
        matchType: "similar",
        status: STATUS.NEEDS_REVIEW,
      },
      {
        productId: "3",
        name: "Болт M8x40",
        price: 22,
        matchType: "similar",
        status: STATUS.IN_STOCK,
      },
    ]);
    expect(best.productId).toBe("1");
    expect(best.price).toBe(45);
  });

  it("among exact matches picks the cheaper variant", () => {
    const best = pickBestInquiryAlternative([
      {
        productId: "1",
        name: "Болт M8x40",
        price: 120,
        matchType: "exact",
        status: STATUS.IN_STOCK,
      },
      {
        productId: "2",
        name: "Болт M8x40 оцинк",
        price: 95,
        matchType: "exact",
        status: STATUS.IN_STOCK,
      },
    ]);
    expect(best.productId).toBe("2");
  });

  it("keeps a literally requested catalog product ahead of a cheaper variant", () => {
    const best = pickBestInquiryAlternative(
      [
        {
          productId: "1",
          name: "Болт DIN 931 M18x140 10.9",
          price: 259.39,
          matchType: "exact",
          status: STATUS.IN_STOCK,
        },
        {
          productId: "2",
          name: "Болт DIN 931 M18x140 10.9 оцинк",
          price: 153.24,
          matchType: "exact",
          status: STATUS.IN_STOCK,
        },
      ],
      "  БОЛТ  DIN 931 M18x140 10.9 "
    );
    expect(best.productId).toBe("1");
  });

  it("picks the cheapest positive analog price instead of zero", () => {
    const best = pickBestInquiryAlternative([
      {
        productId: "1",
        name: "Аналог без цены",
        price: 0,
        matchType: "analog",
        status: STATUS.IN_STOCK,
      },
      {
        productId: "2",
        name: "Дешёвый аналог",
        price: 18.5,
        matchType: "analog",
        status: STATUS.IN_STOCK,
      },
      {
        productId: "3",
        name: "Дорогой аналог",
        price: 25,
        matchType: "analog",
        status: STATUS.IN_STOCK,
      },
    ]);

    expect(best.productId).toBe("2");
    expect(best.price).toBeGreaterThan(0);
  });
});

describe("pickBestPricedSku", () => {
  it("selects the cheapest positive in-stock SKU", () => {
    const best = pickBestPricedSku([
      { sku: "FREE", price: 0, count: 100, available: 1 },
      { sku: "EXPENSIVE", price: 30, count: 10, available: 1 },
      { sku: "CHEAP", price: 12.5, count: 2, available: 1 },
      { sku: "NO-STOCK", price: 5, count: 0, available: 1 },
    ]);

    expect(best.sku).toBe("CHEAP");
  });
});

describe("resolveMatchConcurrency", () => {
  const originalValue = process.env.OFFER_KP_MATCH_CONCURRENCY;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.OFFER_KP_MATCH_CONCURRENCY;
    } else {
      process.env.OFFER_KP_MATCH_CONCURRENCY = originalValue;
    }
  });

  it("defaults to one inquiry line to avoid ONNX SEGV under RAM pressure", () => {
    delete process.env.OFFER_KP_MATCH_CONCURRENCY;
    expect(resolveMatchConcurrency(1)).toBe(1);
    expect(resolveMatchConcurrency(20)).toBe(1);
  });

  it("honors OFFER_KP_MATCH_CONCURRENCY when set", () => {
    process.env.OFFER_KP_MATCH_CONCURRENCY = "3";
    expect(resolveMatchConcurrency(20)).toBe(3);
  });
});

describe("matchInquiryLine exact SKU owns price", () => {
  it("SKU-only digits stay exact + unitPriceNet without DIN (real classify)", async () => {
    jest.resetModules();
    const sku = "003160110060020";
    jest.doMock("../../../utils/offerKp/productSearchAgent", () => ({
      runProductSearchAgent: jest.fn().mockResolvedValue({
        products: [
          {
            id: 18880,
            name: "Винт-барашек DIN  316 M  6x 20 оцинк  (100)",
            matched_sku: sku,
            product_url: "vint_barashek",
            category_url: "vinty",
            _exactSku: true,
            shopMatchSources: ["exact_sku"],
          },
        ],
        strategies: ["exact_sku"],
      }),
      searchByExactSku: jest.fn().mockResolvedValue([]),
    }));
    // Real classifyProductMatch — must not demote for missing DIN.
    jest.doMock("../../../utils/offerKp/goldenCorrections", () => ({
      findGoldenCorrection: () => null,
    }));
    jest.doMock("../../../utils/offerKp/db/client", () => ({
      query: jest.fn().mockResolvedValue([
        {
          sku_id: 9308,
          product_id: 18880,
          sku,
          sku_name: "Винт-барашек DIN  316 M  6x 20 оцинк  (100)",
          price: "8.0300",
          compare_price: "0.0000",
          count: "29209.000",
          available: 1,
          opt_price: null,
        },
      ]),
    }));
    jest.doMock("../../../utils/offerKp/matching", () => ({
      matchEnrichmentEnabled: () => true,
      enrichAlternatives: ({ alternatives }) => ({ alternatives }),
      decideMatchGates: () => ({ gateRejected: true, gateReason: "test_noise" }),
    }));
    jest.doMock("../../../utils/offerKp/variantSpecs", () => ({
      detectVariantAmbiguity: () => ({
        field: "strengthClass",
        values: ["8", "10"],
        minPrice: 1,
        maxPrice: 99,
      }),
      variantPricingKey: () => "",
    }));
    jest.doMock("../../../utils/offerKp/db/layeredCache", () => ({
      buildMatchIdentityCacheKey: () => "test",
      getCachedMatchIdentity: async () => null,
      setCachedMatchIdentity: async () => {},
      getCachedCommercial: async () => null,
      setCachedCommercial: async () => {},
      applyCommercialFields: (line, fields) => ({ ...line, ...fields }),
      resolveIndexVersion: () => "v",
    }));
    jest.doMock("../../../utils/offerKp/db/durableMatchStore", () => ({
      getDurableMatchIdentity: async () => null,
      setDurableMatchIdentity: async () => {},
    }));
    jest.doMock("../../../utils/offerKp/canonicalCatalogIndex", () => ({
      getCanonicalCatalogManifest: () => null,
    }));
    jest.doMock("../../../utils/offerKp/searchMetrics", () => ({
      recordSearchMetric: () => {},
    }));

    const {
      matchInquiryLine,
    } = require("../../../utils/offerKp/matchInquiryLines");
    const row = await matchInquiryLine({
      name: sku,
      raw: sku,
      quantity: 1,
      unit: "шт",
    });

    expect(row.matchType).toBe("exact");
    expect(row.article).toBe(sku);
    expect(row.unitPriceNet).toBe(8.03);
    expect(row.allowPrice).toBe(true);
    expect(row.productId).toBe("18880");

    jest.resetModules();
    jest.dontMock("../../../utils/offerKp/productSearchAgent");
    jest.dontMock("../../../utils/offerKp/goldenCorrections");
    jest.dontMock("../../../utils/offerKp/db/client");
    jest.dontMock("../../../utils/offerKp/matching");
    jest.dontMock("../../../utils/offerKp/variantSpecs");
    jest.dontMock("../../../utils/offerKp/db/layeredCache");
    jest.dontMock("../../../utils/offerKp/db/durableMatchStore");
    jest.dontMock("../../../utils/offerKp/canonicalCatalogIndex");
    jest.dontMock("../../../utils/offerKp/searchMetrics");
  });

  it("prices matched_sku only — never cheapest sibling", async () => {
    jest.resetModules();
    jest.doMock("../../../utils/offerKp/productSearchAgent", () => ({
      runProductSearchAgent: jest.fn().mockResolvedValue({
        products: [
          {
            id: 77,
            name: "Болт DIN 933 M10×25",
            matched_sku: "SKU-A-EXPENSIVE",
            product_url: "https://example/p/77",
          },
        ],
      }),
      searchByExactSku: jest.fn().mockResolvedValue([]),
    }));
    jest.doMock("../../../utils/offerKp/analogRules", () => {
      const actual = jest.requireActual("../../../utils/offerKp/analogRules");
      return {
        ...actual,
        classifyProductMatch: () => ({
          matchType: "exact",
          status: actual.STATUS.IN_STOCK,
          analogOf: null,
        }),
      };
    });
    jest.doMock("../../../utils/offerKp/goldenCorrections", () => ({
      findGoldenCorrection: () => null,
    }));
    jest.doMock("../../../utils/offerKp/db/client", () => ({
      query: jest.fn().mockResolvedValue([
        {
          sku_id: 1,
          product_id: 77,
          sku: "SKU-B-CHEAP",
          sku_name: "cheap",
          price: 5,
          count: 100,
          available: 1,
          opt_price: null,
        },
        {
          sku_id: 2,
          product_id: 77,
          sku: "SKU-A-EXPENSIVE",
          sku_name: "expensive",
          price: 99.5,
          count: 10,
          available: 1,
          opt_price: null,
        },
      ]),
    }));
    jest.doMock("../../../utils/offerKp/matching", () => ({
      matchEnrichmentEnabled: () => false,
      enrichAlternatives: ({ alternatives }) => ({ alternatives }),
      decideMatchGates: () => ({}),
    }));
    jest.doMock("../../../utils/offerKp/variantSpecs", () => ({
      detectVariantAmbiguity: () => null,
      variantPricingKey: () => "",
    }));

    const {
      matchInquiryLine,
    } = require("../../../utils/offerKp/matchInquiryLines");
    const row = await matchInquiryLine({
      name: "SKU-A-EXPENSIVE",
      raw: "SKU-A-EXPENSIVE",
      quantity: 1,
      unit: "шт",
    });

    expect(row.matchType).toBe("exact");
    expect(row.article).toBe("SKU-A-EXPENSIVE");
    expect(row.unitPriceNet).toBe(99.5);
    expect(row.unitPriceNet).not.toBe(5);

    jest.resetModules();
    jest.dontMock("../../../utils/offerKp/productSearchAgent");
    jest.dontMock("../../../utils/offerKp/analogRules");
    jest.dontMock("../../../utils/offerKp/goldenCorrections");
    jest.dontMock("../../../utils/offerKp/db/client");
    jest.dontMock("../../../utils/offerKp/matching");
    jest.dontMock("../../../utils/offerKp/variantSpecs");
  });
});

describe("matchInquiryLine price acceptance", () => {
  it("does not accept similar-only candidate price (18.50 spam)", async () => {
    jest.resetModules();
    jest.doMock("../../../utils/offerKp/productSearchAgent", () => ({
      runProductSearchAgent: jest.fn().mockResolvedValue({
        products: [
          {
            id: 9,
            name: "Болт DIN 931 M10×100 5.8 оцинк",
            product_url: "https://example/p/9",
          },
        ],
      }),
    }));
    jest.doMock("../../../utils/offerKp/analogRules", () => {
      const actual = jest.requireActual("../../../utils/offerKp/analogRules");
      return {
        ...actual,
        classifyProductMatch: () => ({
          matchType: "similar",
          status: actual.STATUS.NEEDS_REVIEW,
          analogOf: null,
        }),
      };
    });
    jest.doMock("../../../utils/offerKp/db/client", () => ({
      query: jest
        .fn()
        .mockResolvedValue([
          { sku: "009315100100100", price: 18.5, stock_count: 713 },
        ]),
    }));
    jest.doMock("../../../utils/offerKp/priceResolve", () => ({
      resolveProductPrice: () => 18.5,
    }));

    const {
      matchInquiryLine,
    } = require("../../../utils/offerKp/matchInquiryLines");
    const row = await matchInquiryLine({
      name: "Болт M6×25 ГОСТ 7805-70",
      raw: "Болт M6×25 ГОСТ 7805-70 | 3 | кг",
      quantity: 3,
      unit: "кг",
    });

    expect(row.matchType).toBe("similar");
    expect(row.unitPriceNet).toBe(0);
    expect(row.productId).toBe("");
    expect(row.status).toMatch(/нет|заказ|проверк/i);

    jest.resetModules();
    jest.dontMock("../../../utils/offerKp/productSearchAgent");
    jest.dontMock("../../../utils/offerKp/analogRules");
    jest.dontMock("../../../utils/offerKp/db/client");
    jest.dontMock("../../../utils/offerKp/priceResolve");
  });
});

describe("enforceExactGroundingContract", () => {
  it("demotes exact without productId", () => {
    const out = enforceExactGroundingContract({
      matchType: "exact",
      productId: "",
      status: STATUS.IN_STOCK,
      kpStatus: "Точное соответствие",
      allowPrice: true,
    });
    expect(out.matchType).toBe("none");
    expect(out.productId).toBe("");
    expect(out.status).toBe(STATUS.NEEDS_REVIEW);
    expect(out.allowPrice).toBe(false);
    expect(out.demoted).toBe(true);
  });

  it("demotes exact on retriever disagreement even with productId", () => {
    const out = enforceExactGroundingContract({
      matchType: "exact",
      productId: "123",
      retrieverDisagreement: { lexicalProductId: "1", embeddingProductId: "2" },
      allowPrice: true,
      status: STATUS.IN_STOCK,
      kpStatus: "Точное соответствие",
    });
    expect(out.matchType).toBe("none");
    expect(out.productId).toBe("");
    expect(out.allowPrice).toBe(false);
  });

  it("keeps grounded exact", () => {
    const out = enforceExactGroundingContract({
      matchType: "exact",
      productId: "123",
      allowPrice: true,
      status: STATUS.IN_STOCK,
      kpStatus: "Точное соответствие",
    });
    expect(out.matchType).toBe("exact");
    expect(out.productId).toBe("123");
    expect(out.allowPrice).toBe(true);
    expect(out.demoted).toBe(false);
  });
});

describe("null product / alternative guards", () => {
  it("pickBestInquiryAlternative ignores null slots", () => {
    const best = pickBestInquiryAlternative(
      [
        null,
        undefined,
        {
          productId: "9",
          name: "Болт DIN 933 M8x40",
          price: 12,
          matchType: "exact",
          status: STATUS.IN_STOCK,
        },
      ],
      "Болт DIN 933 M8x40"
    );
    expect(best?.productId).toBe("9");
    expect(best?.name).toBe("Болт DIN 933 M8x40");
  });

  it("enrichAlternatives does not throw on null products/alts", () => {
    const { enrichAlternatives } = require("../../../utils/offerKp/matching");
    const out = enrichAlternatives({
      queryText: "болт DIN 933 M8x40",
      alternatives: [
        null,
        {
          name: "Болт DIN 933 M8x40",
          productId: "1",
          matchType: "exact",
          price: 10,
        },
      ],
      products: [null, { id: 1, name: "Болт DIN 933 M8x40" }],
      matchStrategies: [],
    });
    expect(Array.isArray(out.alternatives)).toBe(true);
    expect(out.alternatives.length).toBeGreaterThanOrEqual(1);
    expect(out.alternatives.every((a) => a && typeof a === "object")).toBe(
      true
    );
  });

  it("buildDraftFromMatchedLines drops null line slots", () => {
    const {
      buildDraftFromMatchedLines,
      calculateTotalWeightKg,
    } = require("../../../utils/offerKp/matchInquiryLines");
    const draft = buildDraftFromMatchedLines([
      null,
      {
        name: "Болт DIN 933 M8x40",
        lineTotal: 10,
        weightKg: 0.01,
        quantity: 2,
      },
      undefined,
    ]);
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0].name).toBe("Болт DIN 933 M8x40");
    expect(draft.subtotal).toBe(10);
    expect(calculateTotalWeightKg([null, { weightKg: 1, quantity: 3 }])).toBe(3);
  });
});
