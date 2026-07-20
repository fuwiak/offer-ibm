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
