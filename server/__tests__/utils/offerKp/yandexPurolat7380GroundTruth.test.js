"use strict";

/**
 * Yandex site:purolat.com ground-truth for:
 *   Винт ISO 7380-1 M 10x 25 10.9 П/Р / ГОСТ 28963-91 (200)
 *   https://purolat.com/shop/vint/ISO-7380-gost-28963-91/vint-iso-7380-1-m-10x-25-109-p-r-gost-28963-91-200-/
 *   product_id=31855  Арт. 073801000100025  цена 9.80
 *
 * CI without ShopDB: golden override only.
 * With SHOP_DB_* (Lainey / local): live match + URL + price.
 */

const path = require("path");
const fs = require("fs");

const {
  reloadGoldenCorrections,
  findGoldenCorrection,
} = require("../../../utils/offerKp/goldenCorrections");
const {
  buildGroundedCatalogCardsFromDraft,
  resolvePublicProductUrl,
} = require("../../../utils/offerKp/groundedResponse");
const {
  buildProductUrl,
  getShopBaseUrl,
} = require("../../../utils/offerKp/productUrl");

const YANDEX_PRODUCT = {
  productId: "31855",
  sku: "073801000100025",
  price: 9.8,
  name: "Винт ISO 7380-1 M 10x 25 10.9 П/Р / ГОСТ 28963-91  (200)",
  categoryUrl: "vint/ISO-7380-gost-28963-91",
  slug: "vint-iso-7380-1-m-10x-25-109-p-r-gost-28963-91-200-",
  publicUrl:
    "https://purolat.com/shop/vint/ISO-7380-gost-28963-91/vint-iso-7380-1-m-10x-25-109-p-r-gost-28963-91-200-/",
  inquiry:
    "Винт ISO 7380-1 M 10x 25 10.9 П/Р / ГОСТ 28963-91 (200) – 200 шт. Арт. 073801000100025",
};

describe("Yandex purolat ISO 7380-1 M10x25 10.9 ground truth", () => {
  beforeAll(() => {
    reloadGoldenCorrections();
  });

  it("fixture files exist", () => {
    const root = path.join(__dirname, "../../../../test_files");
    expect(
      fs.existsSync(path.join(root, "Yandex_purolat_ISO7380_M10x25_10.9.txt"))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(root, "Yandex_purolat_ISO7380_M10x25_10.9.expected.csv")
      )
    ).toBe(true);
  });

  it("golden override maps the real .txt fixture → SKU 073801000100025", () => {
    // matchInquiryLine looks up findGoldenCorrection([line.raw, line.name]) —
    // parsed from the actual .txt fixture, not the free-text inquiry string
    // above (which has a different layout: article inline vs. on its own
    // line). The CSV source_name must match parseInquiryText's `name` output
    // for the real fixture, or the override silently never fires in prod.
    const { parseInquiryText } = require("../../../utils/offerKp/parseInquiry");
    const root = path.join(__dirname, "../../../../test_files");
    const raw = fs.readFileSync(
      path.join(root, "Yandex_purolat_ISO7380_M10x25_10.9.txt"),
      "utf8"
    );
    const [line] = parseInquiryText(raw);
    expect(line).toBeDefined();
    const hit = findGoldenCorrection([line.raw, line.name]);
    expect(hit).not.toBeNull();
    expect(hit.sku).toBe(YANDEX_PRODUCT.sku);
    expect(hit.matchType).toBe("exact");
  });

  it("buildProductUrl matches live purolat product page", () => {
    const url = buildProductUrl(
      getShopBaseUrl(),
      YANDEX_PRODUCT.categoryUrl,
      YANDEX_PRODUCT.slug
    );
    expect(url).toBe(YANDEX_PRODUCT.publicUrl);
  });

  it("grounded chat card exposes ShopDB price + absolute URL (not /product/{sku})", () => {
    const draft = {
      lines: [
        {
          requestedName: YANDEX_PRODUCT.inquiry,
          name: YANDEX_PRODUCT.name,
          productId: YANDEX_PRODUCT.productId,
          article: YANDEX_PRODUCT.sku,
          unitPriceNet: YANDEX_PRODUCT.price,
          matchType: "exact",
          productUrl: YANDEX_PRODUCT.slug,
          categoryUrl: YANDEX_PRODUCT.categoryUrl,
        },
      ],
    };
    expect(resolvePublicProductUrl(draft.lines[0])).toBe(
      YANDEX_PRODUCT.publicUrl
    );
    const cards = buildGroundedCatalogCardsFromDraft(draft, []);
    expect(cards).toContain(`Цена: ${YANDEX_PRODUCT.price.toFixed(2)} RUB`);
    expect(cards).toContain(`Артикул / SKU: ${YANDEX_PRODUCT.sku}`);
    expect(cards).toContain(
      `ID товара (shop_product.id): ${YANDEX_PRODUCT.productId}`
    );
    expect(cards).toContain(`Ссылка: ${YANDEX_PRODUCT.publicUrl}`);
    expect(cards).not.toContain("/product/073801");
    expect(cards).not.toContain("/product/451049");
  });
});

const describeLive =
  process.env.SHOP_DB_INTEGRATION === "1" ||
  process.env.SHOP_DB_INTEGRATION === "true"
    ? describe
    : describe.skip;

describeLive("Yandex purolat ISO 7380 live ShopDB", () => {
  beforeAll(() => {
    const { loadEnv } = require("../../../config/loadEnv");
    process.chdir(path.resolve(__dirname, "../../.."));
    loadEnv();
  });

  it("searchByExactSku + matchInquiryLine hit product 31855 @ 9.80", async () => {
    const { isShopDbConfigured } = require("../../../utils/offerKp/db/client");
    if (!isShopDbConfigured()) return;

    const {
      searchByExactSku,
    } = require("../../../utils/offerKp/productSearchAgent");
    const {
      matchInquiryLine,
    } = require("../../../utils/offerKp/matchInquiryLines");
    const { parseInquiryText } = require("../../../utils/offerKp/parseInquiry");

    const hits = await searchByExactSku([YANDEX_PRODUCT.sku], 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(String(hits[0].id)).toBe(YANDEX_PRODUCT.productId);
    expect(Number(hits[0].price)).toBeCloseTo(YANDEX_PRODUCT.price, 1);

    const lines = parseInquiryText(YANDEX_PRODUCT.inquiry);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const matched = await matchInquiryLine(lines[0], {});
    expect(String(matched.productId)).toBe(YANDEX_PRODUCT.productId);
    expect(matched.article).toBe(YANDEX_PRODUCT.sku);
    expect(Number(matched.unitPriceNet)).toBeCloseTo(YANDEX_PRODUCT.price, 1);
    expect(matched.matchType).toBe("exact");
    expect(String(matched.productUrl || "")).toContain(
      "vint-iso-7380-1-m-10x-25-109-p-r-gost-28963-91-200-"
    );
    expect(String(matched.productUrl || "")).toMatch(
      /^https:\/\/purolat\.com\//
    );
  }, 60000);
});
