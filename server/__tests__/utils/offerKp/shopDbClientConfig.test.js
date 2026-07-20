/* eslint-env jest, node */

const {
  shopDbConnectionLimit,
} = require("../../../utils/offerKp/db/client");

describe("ShopDB client configuration", () => {
  const originalValue = process.env.SHOP_DB_CONNECTION_LIMIT;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.SHOP_DB_CONNECTION_LIMIT;
    } else {
      process.env.SHOP_DB_CONNECTION_LIMIT = originalValue;
    }
  });

  it("uses a safe default and supports a bounded pool override", () => {
    delete process.env.SHOP_DB_CONNECTION_LIMIT;
    expect(shopDbConnectionLimit()).toBe(4);

    process.env.SHOP_DB_CONNECTION_LIMIT = "12";
    expect(shopDbConnectionLimit()).toBe(12);

    process.env.SHOP_DB_CONNECTION_LIMIT = "100";
    expect(shopDbConnectionLimit()).toBe(32);
  });
});
