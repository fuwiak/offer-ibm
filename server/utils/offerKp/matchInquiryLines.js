/**
 * Сверка позиций заявки с каталогом и формирование строк черновика КП.
 */

const { query } = require("./db/client");
const { TABLES, SKU_COLUMNS: S } = require("./db/schema");
const { parseInquiryText } = require("./parseInquiry");
const { runProductSearchAgent } = require("./productSearchAgent");
const { classifyProductMatch, STATUS } = require("./analogRules");
const { generateQuoteReference } = require("../offerKpApp/pricing");
const { resolveProductPrice } = require("./priceResolve");

const VAT_RATE = Number(process.env.OFFER_KP_VAT_RATE || 0.2);

async function fetchProductStock(productId) {
  const rows = await query(
    `SELECT ${S.sku} AS sku, ${S.name} AS sku_name, price, count, available
     FROM ${TABLES.productSkus}
     WHERE ${S.productId} = ?
     ORDER BY count DESC
     LIMIT 5`,
    [productId]
  );
  const totalStock = rows.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
  const bestSku = rows[0] || {};
  return {
    sku: bestSku.sku || "",
    skuName: bestSku.sku_name || "",
    price: Number(bestSku.price) || Number(bestSku.compare_price) || 0,
    stockCount: totalStock,
    skus: rows,
  };
}

async function matchInquiryLine(inquiryLine, options = {}) {
  const searchText = inquiryLine.raw || inquiryLine.name;
  let { products } = await runProductSearchAgent({
    message: searchText,
    chatHistory: options.chatHistory,
    workspace: options.workspace,
    limit: 8,
    parsedFileTexts: options.parsedFileTexts || null,
  });

  if (!products.length) {
    const {
      runShopDbSearchAgent,
      shopDbSearchAgentEnabled,
    } = require("./searchAgent");
    const { parseHardwareQuery } = require("./hardwareQuery");
    if (shopDbSearchAgentEnabled()) {
      const fallback = await runShopDbSearchAgent({
        searchText,
        parsed: parseHardwareQuery(searchText),
        existingProducts: [],
        limit: 8,
        workspace: options.workspace,
      });
      products = fallback.products || [];
    }
  }

  const alternatives = [];

  for (const product of products.slice(0, 5)) {
    const stock = await fetchProductStock(product.id);
    const classification = classifyProductMatch(searchText, {
      ...product,
      ...stock,
    });
    alternatives.push({
      productId: String(product.id),
      name: product.name,
      sku: stock.sku,
      price: stock.price || resolveProductPrice(product) || 0,
      stockCount: stock.stockCount,
      matchType: classification.matchType,
      status: classification.status,
      analogOf: classification.analogOf,
      productUrl: product.product_url || product.url,
    });
  }

  const best =
    alternatives.find((a) => a.status === STATUS.IN_STOCK) ||
    alternatives.find((a) => a.status === STATUS.ANALOG) ||
    alternatives.find((a) => a.matchType !== "none") ||
    null;

  const qty = inquiryLine.quantity || 1;
  const unitPrice = best?.price || 0;
  const priceWithVat = Number((unitPrice * (1 + VAT_RATE)).toFixed(2));
  const lineTotal = Number((priceWithVat * qty).toFixed(2));
  const weightKg = estimateWeightKg(inquiryLine, best?.name);

  let status = inquiryLine.needsReview
    ? STATUS.NEEDS_REVIEW
    : best?.status || STATUS.OUT_OF_STOCK;

  return {
    inquiryRaw: inquiryLine.raw,
    name: best?.name || inquiryLine.name,
    requestedName: inquiryLine.name,
    article: best?.sku || "",
    productId: best?.productId || "",
    quantity: qty,
    unit: inquiryLine.unit || "шт",
    priceWithVat,
    unitPriceNet: unitPrice,
    lineTotal,
    weightKg,
    status,
    matchType: best?.matchType || "none",
    analogOf: best?.analogOf || null,
    comment: inquiryLine.specialRequirements || "",
    thread: inquiryLine.thread,
    alternatives,
  };
}

function estimateWeightKg(inquiryLine, productName) {
  const text = `${inquiryLine.raw} ${productName || ""}`;
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*кг/i);
  if (m) return Number(m[1].replace(",", "."));
  if (inquiryLine.thread) {
    const size = Number(inquiryLine.thread.size) || 8;
    const len = Number(inquiryLine.thread.length) || 40;
    return Number(((size * len * 0.002) / 1000).toFixed(4));
  }
  return 0;
}

async function matchInquiryToDraft(inquiryText, options = {}) {
  const lines = parseInquiryText(inquiryText);
  if (!lines.length) {
    return {
      reference: generateQuoteReference({ prefix: "KP" }),
      lines: [],
      subtotal: 0,
      totalWeightKg: 0,
      total: 0,
    };
  }

  const matched = [];
  for (const line of lines) {
    matched.push(
      await matchInquiryLine(line, {
        ...options,
        parsedFileTexts: options.parsedFileTexts || null,
      })
    );
  }

  const subtotal = matched.reduce((s, l) => s + (l.lineTotal || 0), 0);
  const totalWeightKg = matched.reduce(
    (s, l) => s + (l.weightKg || 0) * (l.quantity || 1),
    0
  );

  return {
    reference: generateQuoteReference({ prefix: "KP" }),
    lines: matched,
    subtotal: Number(subtotal.toFixed(2)),
    totalWeightKg: Number(totalWeightKg.toFixed(3)),
    total: Number(subtotal.toFixed(2)),
    vatRate: VAT_RATE,
  };
}

module.exports = {
  matchInquiryToDraft,
  matchInquiryLine,
  fetchProductStock,
};
