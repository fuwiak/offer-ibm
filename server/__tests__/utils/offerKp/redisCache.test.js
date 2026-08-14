/* eslint-env jest, node */

jest.mock("../../../utils/offerKp/queue/redisClient", () => ({
  getSharedRedis: jest.fn(),
}));

const { getSharedRedis } = require("../../../utils/offerKp/queue/redisClient");
const {
  redisCacheEnabled,
  getRedisCachedJson,
  setRedisCachedJson,
  resetRedisCacheForTests,
  KEY_PREFIX,
} = require("../../../utils/offerKp/db/redisCache");

describe("redisCache (optional L2)", () => {
  beforeEach(() => {
    resetRedisCacheForTests();
    getSharedRedis.mockReset();
    delete process.env.OFFER_KP_REDIS_CACHE;
  });

  it("is disabled by default — every op is a silent miss", async () => {
    expect(redisCacheEnabled()).toBe(false);
    expect(await getRedisCachedJson("k")).toBeUndefined();
    expect(await setRedisCachedJson("k", { a: 1 })).toBe(false);
    expect(getSharedRedis).not.toHaveBeenCalled();
  });

  it("round-trips JSON with prefix and TTL when enabled", async () => {
    process.env.OFFER_KP_REDIS_CACHE = "1";
    const store = new Map();
    getSharedRedis.mockResolvedValue({
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => {
        store.set(k, v);
        return "OK";
      },
    });
    expect(await setRedisCachedJson("search:abc", { products: [1] }, 600)).toBe(
      true
    );
    expect(store.has(`${KEY_PREFIX}search:abc`)).toBe(true);
    expect(await getRedisCachedJson("search:abc")).toEqual({ products: [1] });
    expect(await getRedisCachedJson("missing")).toBeUndefined();
  });

  it("fails open when Redis is down and backs off", async () => {
    process.env.OFFER_KP_REDIS_CACHE = "1";
    getSharedRedis.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await getRedisCachedJson("k")).toBeUndefined();
    // Backoff window: no reconnect storm on the next call.
    expect(await getRedisCachedJson("k")).toBeUndefined();
    expect(getSharedRedis).toHaveBeenCalledTimes(1);
  });
});
