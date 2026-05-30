/* eslint-env jest, node */

describe("normalizeShopDbEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("corrects legacy DB_PORT 1500 to 3306", () => {
    process.env.DB_PORT = "1500";
    process.env.DB_HOST = "46.173.17.34";
    process.env.DB_NAME = "purolat_com";
    process.env.DB_USER = "llm";
    process.env.DB_PASSWORD = "secret";
    delete process.env.DATABASE_URL;

    const { normalizeShopDbEnv } = require("../../../config/normalizeShopDbEnv");
    const fixes = normalizeShopDbEnv({ log: false });

    expect(process.env.DB_PORT).toBe("3306");
    expect(fixes.some((f) => f.includes("1500"))).toBe(true);
    expect(process.env.DATABASE_URL).toContain(":3306/purolat_com");
  });

  it("corrects DATABASE_URL port 1500 to 3306", () => {
    delete process.env.DB_PORT;
    process.env.DATABASE_URL =
      "mysql://llm:secret@46.173.17.34:1500/purolat_com";

    const { normalizeShopDbEnv } = require("../../../config/normalizeShopDbEnv");
    const fixes = normalizeShopDbEnv({ log: false });

    expect(process.env.DATABASE_URL).toContain(":3306/purolat_com");
    expect(fixes.some((f) => f.includes("1500"))).toBe(true);
  });

  it("syncs DATABASE_URL port when DB_PORT differs", () => {
    process.env.DB_PORT = "3306";
    process.env.DATABASE_URL =
      "mysql://llm:secret@46.173.17.34:1500/purolat_com";

    const { normalizeShopDbEnv } = require("../../../config/normalizeShopDbEnv");
    normalizeShopDbEnv({ log: false });

    expect(process.env.DATABASE_URL).toContain(":3306/purolat_com");
  });
});

describe("offerKp shop DB client", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("builds target from DB_* without exposing password", () => {
    process.env.DATABASE_URL = "";
    process.env.DB_HOST = "46.173.17.34";
    process.env.DB_PORT = "3306";
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
    expect(target.port).toBe("3306");
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
