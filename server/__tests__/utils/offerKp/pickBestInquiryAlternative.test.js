/* eslint-env jest, node */

const {
  pickBestInquiryAlternative,
  pickBestPricedSku,
  resolveMatchConcurrency,
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

  it("limits the default SQL fan-out to two inquiry lines", () => {
    delete process.env.OFFER_KP_MATCH_CONCURRENCY;
    expect(resolveMatchConcurrency(1)).toBe(1);
    expect(resolveMatchConcurrency(20)).toBe(2);
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
      query: jest.fn().mockResolvedValue([
        { sku: "009315100100100", price: 18.5, stock_count: 713 },
      ]),
    }));
    jest.doMock("../../../utils/offerKp/priceResolve", () => ({
      resolveProductPrice: () => 18.5,
    }));

    const { matchInquiryLine } = require("../../../utils/offerKp/matchInquiryLines");
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
