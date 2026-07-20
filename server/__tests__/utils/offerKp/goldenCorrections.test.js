const fs = require("fs");
const os = require("os");
const path = require("path");

describe("goldenCorrections", () => {
  const tmpFiles = [];

  afterEach(() => {
    jest.resetModules();
    while (tmpFiles.length) {
      const file = tmpFiles.pop();
      fs.rmSync(file, { force: true });
    }
  });

  function writeTmpCsv(content) {
    const file = path.join(
      os.tmpdir(),
      `golden-corrections-test-${Date.now()}-${Math.random().toString(36).slice(2)}.expected.csv`
    );
    fs.writeFileSync(file, content, "utf8");
    tmpFiles.push(file);
    return file;
  }

  it("returns [] for extraction-only CSVs (no matched_sku column)", () => {
    // eslint-disable-next-line global-require
    const { parseExpectedCsv } = require("../../../utils/offerKp/goldenCorrections");
    const file = writeTmpCsv(
      'nr,source_name,unit,quantity\n1,"Болт DIN 933 M8x40","шт",10\n'
    );
    expect(parseExpectedCsv(file)).toEqual([]);
  });

  it("parses rows with matched_sku/matched_name/match_type", () => {
    // eslint-disable-next-line global-require
    const { parseExpectedCsv } = require("../../../utils/offerKp/goldenCorrections");
    const file = writeTmpCsv(
      "nr,source_name,unit,quantity,matched_sku,matched_name,match_type\n" +
        '1,"Болт DIN 933 M8x40","шт",10,12345,"Болт DIN 933 M8x40 оцинк",exact\n' +
        '2,"Гайка неизвестная","шт",5,,,none\n'
    );
    const rows = parseExpectedCsv(file);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceName: "Болт DIN 933 M8x40",
      sku: "12345",
      matchedName: "Болт DIN 933 M8x40 оцинк",
      matchType: "exact",
    });
    expect(rows[1]).toMatchObject({
      sourceName: "Гайка неизвестная",
      sku: null,
      matchType: "none",
    });
  });

  it("drops rows with an invalid match_type", () => {
    // eslint-disable-next-line global-require
    const { parseExpectedCsv } = require("../../../utils/offerKp/goldenCorrections");
    const file = writeTmpCsv(
      "nr,source_name,unit,quantity,matched_sku,matched_name,match_type\n" +
        '1,"Болт","шт",1,12345,"Болт",bogus\n'
    );
    expect(parseExpectedCsv(file)).toEqual([]);
  });

  it("findGoldenCorrection returns null when disabled via env", () => {
    process.env.SHOP_DB_GOLDEN_CORRECTIONS = "0";
    // eslint-disable-next-line global-require
    const {
      findGoldenCorrection,
      isGoldenCorrectionsEnabled,
    } = require("../../../utils/offerKp/goldenCorrections");
    expect(isGoldenCorrectionsEnabled()).toBe(false);
    expect(findGoldenCorrection(["Болт DIN 933 M8x40"])).toBeNull();
    delete process.env.SHOP_DB_GOLDEN_CORRECTIONS;
  });

  it("reloadGoldenCorrections against the real test_files tree does not throw", () => {
    // eslint-disable-next-line global-require
    const { reloadGoldenCorrections } = require("../../../utils/offerKp/goldenCorrections");
    expect(() => reloadGoldenCorrections()).not.toThrow();
  });
});
