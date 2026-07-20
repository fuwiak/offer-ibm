const fs = require("fs");
const os = require("os");
const path = require("path");

describe("searchMetrics", () => {
  const ENV_KEY = "SHOP_DB_METRICS_ENABLED";
  const originalEnabled = process.env[ENV_KEY];
  const originalStorageDir = process.env.STORAGE_DIR;
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shopdb-metrics-test-"));
    process.env.STORAGE_DIR = tmpDir;
  });

  afterEach(() => {
    jest.resetModules();
    if (originalEnabled === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnabled;
    if (originalStorageDir === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = originalStorageDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("is enabled by default and appends a JSON line for an event", (done) => {
    // eslint-disable-next-line global-require
    const { recordSearchMetric, METRICS_FILE, isMetricsEnabled } = require("../../../utils/offerKp/searchMetrics");
    expect(isMetricsEnabled()).toBe(true);

    recordSearchMetric({
      matchType: "exact",
      source: "structured",
      strategies: ["structured"],
      hasPrice: true,
      candidateCount: 3,
      queryLen: 20,
      threadId: null,
    });

    setTimeout(() => {
      expect(fs.existsSync(METRICS_FILE)).toBe(true);
      const lines = fs.readFileSync(METRICS_FILE, "utf8").trim().split("\n");
      expect(lines).toHaveLength(1);
      const record = JSON.parse(lines[0]);
      expect(record.matchType).toBe("exact");
      expect(record.strategies).toEqual(["structured"]);
      expect(typeof record.ts).toBe("string");
      done();
    }, 200);
  });

  it("does nothing and creates no file when disabled via env", (done) => {
    process.env[ENV_KEY] = "0";
    // eslint-disable-next-line global-require
    const { recordSearchMetric, METRICS_FILE, isMetricsEnabled } = require("../../../utils/offerKp/searchMetrics");
    expect(isMetricsEnabled()).toBe(false);

    recordSearchMetric({ matchType: "exact" });

    setTimeout(() => {
      expect(fs.existsSync(METRICS_FILE)).toBe(false);
      done();
    }, 200);
  });
});
