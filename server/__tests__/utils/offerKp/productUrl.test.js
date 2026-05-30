/* eslint-env jest, node */

describe("buildProductUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("prepends /shop/ to category and product slug (Webasyst storefront)", () => {
    const { buildProductUrl } = require("../../../utils/offerKp/productUrl");
    const url = buildProductUrl(
      "https://purolat.com",
      "stangi-spilyki/din-975",
      "shtanga_din_975_m36x2000_zn"
    );
    expect(url).toBe(
      "https://purolat.com/shop/stangi-spilyki/din-975/shtanga_din_975_m36x2000_zn/"
    );
  });

  it("does not duplicate shop when category already includes it", () => {
    process.env.SHOP_URL_PREFIX = "shop";
    const { buildProductUrl } = require("../../../utils/offerKp/productUrl");
    const url = buildProductUrl(
      "https://purolat.com",
      "shop/stangi-spilyki/din-975",
      "shtanga_din_975_m36x2000_zn"
    );
    expect(url).toBe(
      "https://purolat.com/shop/stangi-spilyki/din-975/shtanga_din_975_m36x2000_zn/"
    );
  });

  it("allows empty prefix via SHOP_URL_PREFIX=0", () => {
    process.env.SHOP_URL_PREFIX = "0";
    const { buildProductUrl } = require("../../../utils/offerKp/productUrl");
    const url = buildProductUrl(
      "https://purolat.com",
      "stangi-spilyki/din-975",
      "shtanga_din_975_m36x2000_zn"
    );
    expect(url).toBe(
      "https://purolat.com/stangi-spilyki/din-975/shtanga_din_975_m36x2000_zn/"
    );
  });
});
