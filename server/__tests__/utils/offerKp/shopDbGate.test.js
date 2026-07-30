"use strict";

const {
  shopDbGateFailure,
  findShopDbGateFailure,
  gateCodeFromFlags,
} = require("../../../utils/offerKp/shopDbGate");

describe("ShopDB hard gate", () => {
  it.each(["DB_UNAVAILABLE", "INDEX_NOT_READY"])(
    "returns a deterministic failure for %s",
    (code) => {
      const failure = shopDbGateFailure({ shopDbGateCode: code });
      expect(failure.code).toBe(code);
      expect(failure.text).toBeTruthy();
    }
  );

  it("does not hard-abort on NO_MATCH (soft informational)", () => {
    expect(gateCodeFromFlags({ shopDbNoMatch: true })).toBe("NO_MATCH");
    expect(shopDbGateFailure({ shopDbGateCode: "NO_MATCH" })).toBeNull();
    expect(shopDbGateFailure({ shopDbNoMatch: true })).toBeNull();
  });

  it("does not gate non-ShopDB contexts", () => {
    expect(
      findShopDbGateFailure([{ kind: "eli", flags: { eliTimeout: true } }])
    ).toBeNull();
  });
});
