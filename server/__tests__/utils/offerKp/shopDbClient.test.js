/* eslint-env jest, node */

describe("offerKp shop DB client", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("builds target from DB_* without exposing password", () => {
    process.env.DATABASE_URL = "";
    process.env.DB_HOST = "46.173.17.34";
    process.env.DB_PORT = "1500";
    process.env.DB_NAME = "purolat_com";
    process.env.DB_USER = "llm";
    process.env.DB_PASSWORD = "secret";

    const {
      isShopDbConfigured,
      getShopDbTarget,
      buildDatabaseUrl,
    } = require("../../../utils/offerKp/db/client");

    expect(isShopDbConfigured()).toBe(true);
    const target = getShopDbTarget();
    expect(target.host).toBe("46.173.17.34");
    expect(target.port).toBe("1500");
    expect(target.database).toBe("purolat_com");
    expect(target.user).toBe("llm");
    expect(buildDatabaseUrl()).not.toContain("secret");
  });

  it("reports not configured when DB_HOST and DATABASE_URL are unset", () => {
    delete process.env.DATABASE_URL;
    delete process.env.DB_HOST;
    const { isShopDbConfigured, getShopDbTarget } = require("../../../utils/offerKp/db/client");
    expect(isShopDbConfigured()).toBe(false);
    expect(getShopDbTarget().configured).toBe(false);
  });
});
