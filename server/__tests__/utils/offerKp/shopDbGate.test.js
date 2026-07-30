"use strict";

const {
  shopDbGateFailure,
  findShopDbGateFailure,
} = require("../../../utils/offerKp/shopDbGate");

describe("ShopDB hard gate", () => {
  it.each(["DB_UNAVAILABLE", "INDEX_NOT_READY", "NO_MATCH"])(
    "returns a deterministic failure for %s",
    (code) => {
      const failure = shopDbGateFailure({ shopDbGateCode: code });
      expect(failure.code).toBe(code);
      expect(failure.text).toBeTruthy();
    }
  );

  it("does not gate non-ShopDB contexts", () => {
    expect(
      findShopDbGateFailure([{ kind: "eli", flags: { eliTimeout: true } }])
    ).toBeNull();
  });
});
