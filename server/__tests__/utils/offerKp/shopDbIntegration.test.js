/* eslint-env jest, node */

const runIntegration =
  process.env.SHOP_DB_INTEGRATION === "1" ||
  process.env.SHOP_DB_INTEGRATION === "true";

const describeIf = runIntegration ? describe : describe.skip;

describeIf("offerKp shop DB integration (SHOP_DB_INTEGRATION=1)", () => {
  beforeAll(() => {
    const path = require("path");
    const { loadEnv } = require("../../../config/loadEnv");
    process.chdir(path.resolve(__dirname, "../../.."));
    loadEnv();
  });

  it("pings MySQL and validates schema", async () => {
    const { pingShopDb, isShopDbConfigured } = require("../../../utils/offerKp/db/client");
    const { validateShopDbSchema } = require("../../../utils/offerKp/db/validateSchema");

    expect(isShopDbConfigured()).toBe(true);
    const ping = await pingShopDb();
    expect(ping.ok).toBe(true);
    expect(ping.activeProducts).toBeGreaterThan(0);

    const schema = await validateShopDbSchema();
    expect(schema.ok).toBe(true);
  });

  it("returns catalog blocks with price for LLM (stream.js prepends contextTexts)", async () => {
    const { getShopDbContext } = require("../../../utils/offerKp/enrich");
    const { validateLlmContextBlocks } = require("../../../utils/boot/ensureShopDbEnrichBootTest");
    const { LLM_CONTEXT_MARKERS } = require("../../../utils/offerKp/db/schema");

    const ctx = await getShopDbContext(
      "Штанга DIN 975 M36x2000 4.8 оцинк",
      { maxDocs: 2 }
    );
    expect(ctx.contextTexts.length).toBeGreaterThan(0);
    expect(validateLlmContextBlocks(ctx.contextTexts).ok).toBe(true);
    expect(ctx.contextTexts[0]).toContain(LLM_CONTEXT_MARKERS.priceLabel);
    expect(ctx.flags.shopDbDocCount).toBeGreaterThan(0);
  });
});
