/* eslint-env jest, node */

const {
  pickBestInquiryAlternative,
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
