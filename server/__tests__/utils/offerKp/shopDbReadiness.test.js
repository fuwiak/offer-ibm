"use strict";

const { readinessCode } = require("../../../utils/offerKp/shopDbReadiness");

describe("ShopDB readiness contract", () => {
  it("distinguishes database and index failures", () => {
    expect(readinessCode({ mysqlOk: false, indexReady: false })).toBe(
      "DB_UNAVAILABLE"
    );
    expect(readinessCode({ mysqlOk: true, indexReady: false })).toBe(
      "INDEX_NOT_READY"
    );
    expect(readinessCode({ mysqlOk: true, indexReady: true })).toBeNull();
  });
});
