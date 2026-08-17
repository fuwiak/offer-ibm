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

  it("silent material RFQ prefers carbon/zinc over stainless", () => {
    const best = pickBestInquiryAlternative(
      [
        {
          productId: "a4",
          name: "Шайба DIN 125 M 20 нерж A4",
          price: 52.08,
          matchType: "exact",
          status: STATUS.IN_STOCK,
        },
        {
          productId: "zn",
          name: "Шайба DIN 125 M 20 оцинк",
          price: 3.88,
          matchType: "exact",
          status: STATUS.IN_STOCK,
        },
      ],
      "Шайба плоская Ø20"
    );
    expect(best.productId).toBe("zn");
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

  it("exact_sku pin beats cheaper exact sibling", () => {
    const best = pickBestInquiryAlternative([
      {
        productId: "28743",
        name: "Винт DIN  912 M  6x 20 12.9 оцинк",
        sku: "009122100060020",
        price: 1.5,
        matchType: "exact",
        status: STATUS.IN_STOCK,
      },
      {
        productId: "20073",
        name: "Винт DIN  912 M  6x 20 12.9 П/Р",
        sku: "009122000060020",
        price: 2.59,
        matchType: "exact",
        status: STATUS.IN_STOCK,
        matchSource: "exact_sku",
        _exactSku: true,
      },
    ]);
    expect(best.productId).toBe("20073");
    expect(best.price).toBe(2.59);
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

  it("defaults to up to 8 parallel lines — ONNX embeds are serialized by the process-wide lock", () => {
    delete process.env.OFFER_KP_MATCH_CONCURRENCY;
    expect(resolveMatchConcurrency(1)).toBe(1);
    expect(resolveMatchConcurrency(3)).toBe(3);
    expect(resolveMatchConcurrency(20)).toBe(8);
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
      decideMatchGates: () => ({
        gateRejected: true,
        gateReason: "test_noise",
      }),
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

  it("keeps authoritative exact despite retriever disagreement", () => {
    const out = enforceExactGroundingContract({
      matchType: "exact",
      productId: "20073",
      retrieverDisagreement: {
        lexicalProductId: "20073",
        embeddingProductId: "28743",
      },
      authoritative: true,
      allowPrice: true,
      status: STATUS.IN_STOCK,
      kpStatus: "Точное соответствие",
    });
    expect(out.matchType).toBe("exact");
    expect(out.productId).toBe("20073");
    expect(out.allowPrice).toBe(true);
    expect(out.demoted).toBe(false);
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

describe("DIN 912 M6x20 catalog name keeps ShopDB price under disagreement", () => {
  const SKU = "009122000060020";
  const CATALOG_NAME = "Винт DIN  912 M  6x 20 12.9 П/Р / ГОСТ 11738-84  (200)";
  const INQUIRY = "Винт DIN 912 M 6x 20 12.9 П/Р / ГОСТ 11738-84 (200)";

  afterEach(() => {
    for (const mod of [
      "../../../utils/offerKp/productSearchAgent",
      "../../../utils/offerKp/goldenCorrections",
      "../../../utils/offerKp/db/client",
      "../../../utils/offerKp/matching",
      "../../../utils/offerKp/variantSpecs",
      "../../../utils/offerKp/db/layeredCache",
      "../../../utils/offerKp/db/durableMatchStore",
      "../../../utils/offerKp/canonicalCatalogIndex",
      "../../../utils/offerKp/searchMetrics",
    ]) {
      try {
        jest.dontMock(mod);
      } catch {
        /* ignore */
      }
    }
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("literal catalog name + оцинк sibling disagreement still prices 2.59", async () => {
    jest.resetModules();
    jest.doMock("../../../utils/offerKp/productSearchAgent", () => ({
      runProductSearchAgent: jest.fn().mockResolvedValue({
        products: [
          {
            id: 20073,
            name: CATALOG_NAME,
            product_url: "vint_din_912",
            category_url: "vinty",
            _nameSimilarity: 0.97,
            _embeddingSimilarity: 0.55,
            shopMatchSources: ["structured", "rrf"],
          },
          {
            id: 28743,
            name: "Винт DIN  912 M  6x 20 12.9 оцинк П/Р / ГОСТ 11738-84  (200)",
            product_url: "vint_din_912_ocink",
            category_url: "vinty",
            _nameSimilarity: 0.88,
            _embeddingSimilarity: 0.93,
            shopMatchSources: ["structured", "rrf"],
          },
        ],
        strategies: ["structured", "rrf"],
      }),
      searchByExactSku: jest.fn().mockResolvedValue([]),
    }));
    jest.doMock("../../../utils/offerKp/goldenCorrections", () => ({
      findGoldenCorrection: () => null,
    }));
    jest.doMock("../../../utils/offerKp/db/client", () => ({
      query: jest.fn().mockImplementation(async (sql) => {
        if (
          String(sql).includes("shop_product_skus") ||
          String(sql).includes("product_id")
        ) {
          return [
            {
              sku_id: 1,
              product_id: 20073,
              sku: SKU,
              sku_name: CATALOG_NAME,
              price: "2.5900",
              compare_price: "0.0000",
              count: "100.000",
              available: 1,
              opt_price: null,
            },
            {
              sku_id: 2,
              product_id: 28743,
              sku: "009122100060020",
              sku_name: "оцинк",
              price: "3.5400",
              compare_price: "0.0000",
              count: "50.000",
              available: 1,
              opt_price: null,
            },
          ];
        }
        return [];
      }),
    }));
    jest.doMock("../../../utils/offerKp/matching", () => ({
      matchEnrichmentEnabled: () => true,
      enrichAlternatives: ({ alternatives }) => ({ alternatives }),
      decideMatchGates: () => ({
        gateRejected: true,
        gateReason: "retriever_disagreement",
      }),
    }));
    jest.doMock("../../../utils/offerKp/db/layeredCache", () => ({
      buildMatchIdentityCacheKey: () => "test-din912",
      getCachedMatchIdentity: () => null,
      setCachedMatchIdentity: () => {},
      getCachedCommercial: () => null,
      setCachedCommercial: () => {},
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
      detectRetrieverDisagreement,
      isLiteralCatalogNameHit,
    } = require("../../../utils/offerKp/matchInquiryLines");

    expect(isLiteralCatalogNameHit(INQUIRY, CATALOG_NAME)).toBe(true);
    expect(
      detectRetrieverDisagreement([
        {
          id: 20073,
          _nameSimilarity: 0.97,
          _embeddingSimilarity: 0.55,
        },
        {
          id: 28743,
          _nameSimilarity: 0.88,
          _embeddingSimilarity: 0.93,
        },
      ])
    ).toEqual({
      lexicalProductId: "20073",
      embeddingProductId: "28743",
    });

    const row = await matchInquiryLine({
      name: INQUIRY,
      raw: INQUIRY,
      quantity: 1,
      unit: "шт",
    });

    expect(row.matchType).toBe("exact");
    expect(row.article).toBe(SKU);
    expect(row.unitPriceNet).toBe(2.59);
    expect(row.allowPrice).toBe(true);
    expect(row.productId).toBe("20073");
    expect(row.matchSource).toBe("catalog_name_exact");
  });

  it("bare SKU 009122000060020 keeps 2.59 under gate noise", async () => {
    jest.resetModules();
    jest.doMock("../../../utils/offerKp/productSearchAgent", () => ({
      runProductSearchAgent: jest.fn().mockResolvedValue({
        products: [
          {
            id: 20073,
            name: CATALOG_NAME,
            matched_sku: SKU,
            product_url: "vint_din_912",
            category_url: "vinty",
            _exactSku: true,
            shopMatchSources: ["exact_sku"],
          },
        ],
        strategies: ["exact_sku"],
      }),
      searchByExactSku: jest.fn().mockResolvedValue([]),
    }));
    jest.doMock("../../../utils/offerKp/goldenCorrections", () => ({
      findGoldenCorrection: () => null,
    }));
    jest.doMock("../../../utils/offerKp/db/client", () => ({
      query: jest.fn().mockResolvedValue([
        {
          sku_id: 1,
          product_id: 20073,
          sku: SKU,
          sku_name: CATALOG_NAME,
          price: "2.5900",
          compare_price: "0.0000",
          count: "100.000",
          available: 1,
          opt_price: null,
        },
      ]),
    }));
    jest.doMock("../../../utils/offerKp/matching", () => ({
      matchEnrichmentEnabled: () => true,
      enrichAlternatives: ({ alternatives }) => ({ alternatives }),
      decideMatchGates: () => ({
        gateRejected: true,
        gateReason: "test_noise",
      }),
    }));
    jest.doMock("../../../utils/offerKp/variantSpecs", () => ({
      detectVariantAmbiguity: () => ({
        field: "strengthClass",
        values: ["8.8", "12.9"],
        minPrice: 1,
        maxPrice: 99,
      }),
      variantPricingKey: () => "",
    }));
    jest.doMock("../../../utils/offerKp/db/layeredCache", () => ({
      buildMatchIdentityCacheKey: () => "test-sku-din912",
      getCachedMatchIdentity: () => null,
      setCachedMatchIdentity: () => {},
      getCachedCommercial: () => null,
      setCachedCommercial: () => {},
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
      name: SKU,
      raw: SKU,
      quantity: 1,
      unit: "шт",
    });

    expect(row.matchType).toBe("exact");
    expect(row.article).toBe(SKU);
    expect(row.unitPriceNet).toBe(2.59);
    expect(row.allowPrice).toBe(true);
  });

  it("stale allowPrice=false identity still rehydrates 2.59 for exact SKU", async () => {
    jest.resetModules();
    jest.doMock("../../../utils/offerKp/db/client", () => ({
      query: jest.fn().mockResolvedValue([
        {
          sku_id: 10501,
          product_id: 20073,
          sku: SKU,
          sku_name: CATALOG_NAME,
          price: "2.5900",
          compare_price: "0.0000",
          count: "77714.000",
          available: 1,
          opt_price: null,
        },
      ]),
    }));
    // Real layeredCache applyCommercialFields — stale allowPrice must not stick.
    const {
      hydrateLineCommercial,
    } = require("../../../utils/offerKp/matchInquiryLines");

    const hydrated = await hydrateLineCommercial({
      inquiryRaw: SKU,
      name: CATALOG_NAME,
      article: SKU,
      productId: "20073",
      quantity: 1,
      unit: "шт",
      matchType: "exact",
      // Bug: identity freeze after prior demotion
      allowPrice: false,
      unitPriceNet: 0,
    });

    expect(hydrated.allowPrice).toBe(true);
    expect(hydrated.unitPriceNet).toBeCloseTo(2.59, 2);
    expect(hydrated.article).toBe(SKU);
  });
});

describe("DIN 967 M6x20 оцинк (500) ShopDB identity keeps 2.21", () => {
  const SKU = "009673010060020";
  const CATALOG_NAME = "Винт DIN  967 M  6x 20 оцинк  (500)";
  const INQUIRY = "Винт DIN 967 M 6x 20 оцинк (500)";

  afterEach(() => {
    for (const mod of [
      "../../../utils/offerKp/productSearchAgent",
      "../../../utils/offerKp/goldenCorrections",
      "../../../utils/offerKp/db/client",
      "../../../utils/offerKp/matching",
      "../../../utils/offerKp/variantSpecs",
      "../../../utils/offerKp/db/layeredCache",
      "../../../utils/offerKp/db/durableMatchStore",
      "../../../utils/offerKp/canonicalCatalogIndex",
      "../../../utils/offerKp/searchMetrics",
    ]) {
      try {
        jest.dontMock(mod);
      } catch {
        /* ignore */
      }
    }
    jest.resetModules();
    jest.clearAllMocks();
  });

  function mockStockQuery() {
    jest.doMock("../../../utils/offerKp/db/client", () => ({
      query: jest.fn().mockResolvedValue([
        {
          sku_id: 1,
          product_id: 18216,
          sku: SKU,
          sku_name: CATALOG_NAME,
          price: "2.2100",
          compare_price: "0.0000",
          count: "8170.000",
          available: 1,
          opt_price: null,
        },
      ]),
    }));
  }

  function mockCaches(key) {
    jest.doMock("../../../utils/offerKp/db/layeredCache", () => ({
      buildMatchIdentityCacheKey: () => key,
      getCachedMatchIdentity: () => null,
      setCachedMatchIdentity: () => {},
      getCachedCommercial: () => null,
      setCachedCommercial: () => {},
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
    jest.doMock("../../../utils/offerKp/goldenCorrections", () => ({
      findGoldenCorrection: () => null,
    }));
  }

  it("literal catalog name early-exit pins SKU 009673010060020 @ 2.21", async () => {
    jest.resetModules();
    jest.doMock("../../../utils/offerKp/productSearchAgent", () => ({
      runProductSearchAgent: jest.fn().mockResolvedValue({
        products: [
          {
            id: 18216,
            name: CATALOG_NAME,
            matched_sku: SKU,
            matched_sku_price: "2.2100",
            product_url: "vint_din_967",
            category_url: "vinty",
            _catalogNameExact: true,
            shopMatchSources: ["catalog_name_exact"],
          },
        ],
        strategies: ["catalog_name_exact"],
        earlyExit: "catalog_name_exact",
      }),
      searchByExactSku: jest.fn().mockResolvedValue([]),
    }));
    mockStockQuery();
    mockCaches("test-din967-name");
    jest.doMock("../../../utils/offerKp/matching", () => ({
      matchEnrichmentEnabled: () => true,
      enrichAlternatives: () => {
        throw new Error("enrichment must not run on catalog_name_exact");
      },
      decideMatchGates: () => {
        throw new Error("gates must not run on catalog_name_exact");
      },
    }));

    const {
      matchInquiryLine,
      isLiteralCatalogNameHit,
    } = require("../../../utils/offerKp/matchInquiryLines");

    expect(isLiteralCatalogNameHit(INQUIRY, CATALOG_NAME)).toBe(true);
    // OCR/parseInquiry collapses "M 6x 20" → "M6x20" — must still hit.
    expect(
      isLiteralCatalogNameHit("Винт DIN 967 M6x20 оцинк (500)", CATALOG_NAME)
    ).toBe(true);

    const row = await matchInquiryLine({
      name: INQUIRY,
      raw: INQUIRY,
      quantity: 500,
      unit: "шт",
    });

    expect(row.matchType).toBe("exact");
    expect(row.article).toBe(SKU);
    expect(row.unitPriceNet).toBe(2.21);
    expect(row.allowPrice).toBe(true);
    expect(row.productId).toBe("18216");
    expect(row.matchSource).toBe("catalog_name_exact");
    expect(row.status).not.toBe("Аналог");
  });

  it("bare SKU 009673010060020 keeps 2.21 and never becomes analog", async () => {
    jest.resetModules();
    jest.doMock("../../../utils/offerKp/productSearchAgent", () => ({
      runProductSearchAgent: jest.fn().mockResolvedValue({
        products: [
          {
            id: 18216,
            name: CATALOG_NAME,
            matched_sku: SKU,
            matched_sku_price: "2.2100",
            product_url: "vint_din_967",
            category_url: "vinty",
            _exactSku: true,
            shopMatchSources: ["exact_sku"],
          },
        ],
        strategies: ["exact_sku"],
        earlyExit: "exact_sku",
      }),
      searchByExactSku: jest.fn().mockResolvedValue([]),
    }));
    mockStockQuery();
    mockCaches("test-din967-sku");
    jest.doMock("../../../utils/offerKp/matching", () => ({
      matchEnrichmentEnabled: () => true,
      enrichAlternatives: ({ alternatives }) => ({ alternatives }),
      decideMatchGates: () => ({
        gateRejected: true,
        gateReason: "should_be_skipped",
      }),
    }));
    jest.doMock("../../../utils/offerKp/variantSpecs", () => ({
      detectVariantAmbiguity: () => ({
        field: "strengthClass",
        values: ["4.8", "8.8"],
        minPrice: 1,
        maxPrice: 99,
      }),
      variantPricingKey: () => "",
    }));

    const {
      matchInquiryLine,
    } = require("../../../utils/offerKp/matchInquiryLines");
    const row = await matchInquiryLine({
      name: SKU,
      raw: SKU,
      quantity: 500,
      unit: "шт",
    });

    expect(row.matchType).toBe("exact");
    expect(row.article).toBe(SKU);
    expect(row.unitPriceNet).toBe(2.21);
    expect(row.allowPrice).toBe(true);
    expect(row.matchSource).toBe("exact_sku");
    expect(row.status).toBe("В наличии");
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
    expect(calculateTotalWeightKg([null, { weightKg: 1, quantity: 3 }])).toBe(
      3
    );
  });
});
