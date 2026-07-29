const fs = require("fs");
const os = require("os");
const path = require("path");

describe("operatorLearning", () => {
  let tmpDir;
  let prevStorage;

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "offer-kp-learn-"));
    prevStorage = process.env.STORAGE_DIR;
    process.env.STORAGE_DIR = tmpDir;
    delete process.env.SHOP_DB_OPERATOR_LEARNING;
  });

  afterEach(() => {
    if (prevStorage === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = prevStorage;
    delete process.env.SHOP_DB_OPERATOR_LEARNING;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.resetModules();
  });

  function load() {
    // eslint-disable-next-line global-require
    return require("../../../utils/offerKp/operatorLearning");
  }

  it("rejects examples without sourceName", async () => {
    const { teachExamples, normalizeTeachExample } = load();
    expect(normalizeTeachExample({ sku: "1" }).ok).toBe(false);
    const result = await teachExamples([{ sku: "1" }], {
      warmEmbeddings: false,
    });
    expect(result.taught).toBe(0);
    expect(result.success).toBe(false);
  });

  it("persists example and finds it on exact normalized query", async () => {
    const {
      teachExamples,
      findOperatorLearning,
      listOperatorLearningExamples,
      getOperatorLearningStats,
    } = load();

    const result = await teachExamples(
      [
        {
          inquiryRaw: "Болт DIN 933 M8x40",
          sku: "SKU-100",
          name: "Болт DIN 933 M8x40 оцинк",
          matchType: "exact",
        },
      ],
      { warmEmbeddings: false, userId: 7 }
    );

    expect(result.success).toBe(true);
    expect(result.taught).toBe(1);
    expect(result.total).toBe(1);

    const hit = findOperatorLearning(["Болт DIN 933 M8x40"]);
    expect(hit).toMatchObject({
      sourceName: "Болт DIN 933 M8x40",
      sku: "SKU-100",
      matchType: "exact",
      sourceFile: "operator",
    });

    expect(listOperatorLearningExamples()).toHaveLength(1);
    expect(getOperatorLearningStats()).toMatchObject({
      total: 1,
      positive: 1,
      enabled: true,
    });
  });

  it("infers analog from status and allows none without sku", async () => {
    const { teachExamples, findOperatorLearning } = load();
    await teachExamples(
      [
        {
          sourceName: "Гайка M10",
          article: "G-10",
          status: "Аналог",
        },
        {
          sourceName: "Неизвестный крепёж XYZ",
          matchType: "none",
        },
      ],
      { warmEmbeddings: false }
    );

    expect(findOperatorLearning(["Гайка M10"]).matchType).toBe("analog");
    expect(findOperatorLearning(["Неизвестный крепёж XYZ"])).toMatchObject({
      matchType: "none",
      sku: null,
    });
  });

  it("is merged into findGoldenCorrection ahead of CSV", async () => {
    const { teachExamples } = load();
    await teachExamples(
      [
        {
          sourceName: "Тестовая позиция LEARN-ONLY",
          sku: "OP-1",
          matchedName: "Товар из обучения",
          matchType: "exact",
        },
      ],
      { warmEmbeddings: false }
    );

    // eslint-disable-next-line global-require
    const { findGoldenCorrection, listMatchExamples } = require(
      "../../../utils/offerKp/goldenCorrections"
    );
    const hit = findGoldenCorrection(["Тестовая позиция LEARN-ONLY"]);
    expect(hit).toMatchObject({
      sku: "OP-1",
      sourceFile: "operator",
    });
    expect(
      listMatchExamples().some((ex) => ex.sku === "OP-1")
    ).toBe(true);
  });

  it("respects SHOP_DB_OPERATOR_LEARNING=0 kill-switch", async () => {
    process.env.SHOP_DB_OPERATOR_LEARNING = "0";
    jest.resetModules();
    process.env.STORAGE_DIR = tmpDir;
    const { teachExamples, findOperatorLearning, isOperatorLearningEnabled } =
      load();
    expect(isOperatorLearningEnabled()).toBe(false);
    const result = await teachExamples(
      [{ sourceName: "X", sku: "1", matchType: "exact" }],
      { warmEmbeddings: false }
    );
    expect(result.success).toBe(false);
    expect(findOperatorLearning(["X"])).toBeNull();
  });
});
