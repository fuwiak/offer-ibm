const {
  calculateTotalWeightKg,
} = require("../../../utils/offerKp/matchInquiryLines");

describe("OfferKP quote weight", () => {
  test("kg quantity is already total line weight and is not multiplied twice", () => {
    expect(
      calculateTotalWeightKg([
        { quantity: 30, unit: "кг", weightKg: 0, lineWeightKg: 30 },
        { quantity: 14, unit: "кг", weightKg: 0, lineWeightKg: 14 },
      ])
    ).toBe(44);
  });

  test("piece weight is multiplied by piece quantity", () => {
    expect(
      calculateTotalWeightKg([{ quantity: 10, unit: "шт", weightKg: 0.125 }])
    ).toBe(1.25);
  });
});
