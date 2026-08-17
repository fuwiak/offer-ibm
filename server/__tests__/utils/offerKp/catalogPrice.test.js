"use strict";

const { catalogGross } = require("../../../utils/offerKp/catalogPrice");

describe("catalogGross", () => {
  it("does not add 20% VAT on a ShopDB price", () => {
    expect(catalogGross(43.19)).toBe(43.19);
    expect(catalogGross(43.19)).not.toBe(51.83);
  });

  it("zeros empty / junk", () => {
    expect(catalogGross(0)).toBe(0);
    expect(catalogGross(null)).toBe(0);
    expect(catalogGross("x")).toBe(0);
  });
});
