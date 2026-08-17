/* eslint-env jest, node */

const {
  extractStrengthClass,
  isStainless,
  variantPricingKey,
  detectVariantAmbiguity,
} = require("../../../utils/offerKp/variantSpecs");

describe("extractStrengthClass", () => {
  it("reads labelled nut classes", () => {
    expect(extractStrengthClass("Гайка DIN 934 M16 кл.пр.8 оцинк")).toBe("8");
    expect(extractStrengthClass("Гайка DIN 934 M16 кл. прочности 10")).toBe(
      "10"
    );
  });

  it("reads bare bolt classes", () => {
    expect(extractStrengthClass("Болт DIN 933 M 12x 60 8.8 оцинк")).toBe("8.8");
    expect(extractStrengthClass("Винт ISO 7380-1 M 10x 25 10.9 П/Р")).toBe(
      "10.9"
    );
  });

  it("does not read a thread pitch as a strength class", () => {
    expect(extractStrengthClass("Гайка DIN 934 M10x1.25")).toBe("");
  });

  it("returns empty when the text is silent", () => {
    expect(extractStrengthClass("Гайка ГОСТ 5915-70 М16")).toBe("");
  });
});

describe("isStainless", () => {
  it("detects Cyrillic and Latin stainless markers", () => {
    expect(isStainless("Шайба DIN 125 A M10 нерж А2")).toBe(true);
    expect(isStainless("Шайба DIN 125 A M10 A4")).toBe(true);
    expect(isStainless("Шайба DIN 125 A M10 оцинк")).toBe(false);
  });
});

describe("variantPricingKey", () => {
  it("separates strength classes and materials", () => {
    expect(variantPricingKey("Гайка DIN 934 M16 кл.пр.8 оцинк")).not.toBe(
      variantPricingKey("Гайка DIN 934 M16 кл.пр.10 оцинк")
    );
    expect(variantPricingKey("Гайка DIN 934 M16 оцинк")).not.toBe(
      variantPricingKey("Гайка DIN 934 M16 нерж А4")
    );
  });

  it("keeps coating-only differences in one pricing group", () => {
    expect(variantPricingKey("Болт DIN 933 M8x40 8.8")).toBe(
      variantPricingKey("Болт DIN 933 M8x40 8.8 оцинк")
    );
  });
});

describe("matchInquiryLine variant abstention", () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock("../../../utils/offerKp/productSearchAgent");
    jest.dontMock("../../../utils/offerKp/analogRules");
    jest.dontMock("../../../utils/offerKp/db/client");
  });

  it("quotes no price for a nut request without a strength class", async () => {
    jest.resetModules();
    jest.doMock("../../../utils/offerKp/productSearchAgent", () => ({
      runProductSearchAgent: jest.fn().mockResolvedValue({
        products: [
          { id: 1, name: "Гайка DIN 934 M16 кл.пр.8 оцинк" },
          { id: 2, name: "Гайка DIN 934 M16 кл.пр.10 оцинк" },
        ],
      }),
      searchByExactSku: jest.fn().mockResolvedValue(null),
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
    jest.doMock("../../../utils/offerKp/db/client", () => ({
      query: jest.fn().mockResolvedValue([
        {
          product_id: 1,
          sku: "009348000160000",
          sku_name: "",
          price: 7.54,
          count: 500,
          available: 1,
        },
        {
          product_id: 2,
          sku: "009348000160001",
          sku_name: "",
          price: 50.05,
          count: 500,
          available: 1,
        },
      ]),
    }));

    const {
      matchInquiryLine,
    } = require("../../../utils/offerKp/matchInquiryLines");
    const row = await matchInquiryLine({
      name: "Гайка DIN 934 M16",
      raw: "Гайка DIN 934 M16 | 100 | шт",
      quantity: 100,
      unit: "шт",
    });

    expect(row.matchType).toBe("spec_unconfirmed");
    expect(row.reviewReason).toBe("spec_unconfirmed");
    expect(row.unitPriceNet).toBe(0);
    expect(row.lineTotal).toBe(0);
    expect(row.kpStatus).toBe("Требуется проверка");
    expect(row.comment).toMatch(/класс прочности/i);
  });
});

describe("detectVariantAmbiguity", () => {
  const nutAlternatives = [
    {
      name: "Гайка DIN 934 M16 кл.пр.8 оцинк",
      price: 7.54,
      matchType: "exact",
    },
    {
      name: "Гайка DIN 934 M16 кл.пр.10 оцинк",
      price: 12.3,
      matchType: "exact",
    },
  ];

  it("flags an underspecified nut request with class variants", () => {
    const ambiguity = detectVariantAmbiguity({
      queryText: "Гайка DIN 934 M16",
      alternatives: nutAlternatives,
    });
    expect(ambiguity).toMatchObject({
      field: "strengthClass",
      values: ["10", "8"],
      minPrice: 7.54,
      maxPrice: 12.3,
    });
  });

  it("stays silent when the request pins the class", () => {
    expect(
      detectVariantAmbiguity({
        queryText: "Гайка DIN 934 M16 кл.пр.8",
        alternatives: nutAlternatives,
      })
    ).toBeNull();
  });

  it("defaults to carbon/zinc when RFQ is silent on material", () => {
    expect(
      detectVariantAmbiguity({
        queryText: "Гайка DIN 934 M16 кл.пр.8",
        alternatives: [
          {
            name: "Гайка DIN 934 M16 кл.пр.8 оцинк",
            price: 7.54,
            matchType: "exact",
          },
          {
            name: "Гайка DIN 934 M16 кл.пр.8 нерж А4",
            price: 50.05,
            matchType: "exact",
          },
        ],
      })
    ).toBeNull();
  });

  it("ignores candidates that cannot be priced anyway", () => {
    expect(
      detectVariantAmbiguity({
        queryText: "Гайка DIN 934 M16",
        alternatives: [
          nutAlternatives[0],
          { ...nutAlternatives[1], matchType: "similar" },
        ],
      })
    ).toBeNull();
  });

  it("treats the ГОСТ and the DIN phrasing of one request alike", () => {
    const alternatives = [
      {
        name: "Гайка DIN 934 M16 кл.пр.8 оцинк",
        price: 7.54,
        matchType: "exact",
      },
      {
        name: "Гайка DIN 934 M16 кл.пр.10 оцинк",
        price: 50.05,
        matchType: "exact",
      },
    ];
    expect(
      detectVariantAmbiguity({ queryText: "Гайка DIN 934 M16", alternatives })
    ).not.toBeNull();
    expect(
      detectVariantAmbiguity({
        queryText: "Гайка ГОСТ 5915-70 М16",
        alternatives,
      })
    ).not.toBeNull();
  });

  it("defaults silent washer RFQ to carbon/zinc despite нерж/латунь", () => {
    expect(
      detectVariantAmbiguity({
        queryText: "Шайба плоская Ø20",
        alternatives: [
          {
            name: "Шайба DIN 125 M 20 оцинк / ГОСТ 11371-78",
            price: 3.88,
            matchType: "exact",
          },
          {
            name: "Шайба DIN 125 M 20 латунь",
            price: 18.4,
            matchType: "exact",
          },
          {
            name: "Шайба DIN 125 M 20 нерж A2",
            price: 22.1,
            matchType: "exact",
          },
          {
            name: "Шайба DIN 125 M 20 нерж A4",
            price: 52.08,
            matchType: "exact",
          },
        ],
      })
    ).toBeNull();
  });

  it("ignores variants priced within the spread tolerance", () => {
    expect(
      detectVariantAmbiguity({
        queryText: "Гайка DIN 934 M16",
        alternatives: [
          { name: "Гайка DIN 934 M16 кл.пр.8", price: 7.5, matchType: "exact" },
          {
            name: "Гайка DIN 934 M16 кл.пр.10",
            price: 7.6,
            matchType: "exact",
          },
        ],
      })
    ).toBeNull();
  });
});
