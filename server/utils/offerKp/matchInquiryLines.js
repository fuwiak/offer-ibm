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
const { pickCheaperAmongSimilar } = require("./nameSimilarity");

const VAT_RATE = Number(process.env.OFFER_KP_VAT_RATE || 0.2);

/**
 * Выбор кандидата для строки заявки.
 * Приоритет: exact → analog → in_stock → остальные.
 * Дешёвый SKU — только среди одинакового matchType (не между M10x100 и M6x25).
 */
function pickBestInquiryAlternative(alternatives = []) {
  const list = (alternatives || []).filter(Boolean);
  if (!list.length) return null;

  const byType = (type) => list.filter((a) => a.matchType === type);
  const exact = byType("exact");
  const analogs = byType("analog");
  const inStock = list.filter((a) => a.status === STATUS.IN_STOCK);
  const usable = list.filter(
    (a) => a.matchType !== "none" && a.matchType !== "size_mismatch"
  );

  const pool = exact.length
    ? exact
    : analogs.length
      ? analogs
      : inStock.length
        ? inStock
        : usable;

  if (!pool.length) return null;
  if (pool.length === 1) return pool[0];

  // Среди exact/analog одного размера — берём дешевле (варианты покрытия и т.п.).
  if (exact.length || analogs.length) {
    const byPrice = [...pool].sort(
      (a, b) => (Number(a.price) || 0) - (Number(b.price) || 0)
    );
    return (
      pickCheaperAmongSimilar(byPrice, {
        getPrice: (a) => Number(a.price) || 0,
      }) || byPrice[0]
    );
  }

  // Без точного совпадения — не брать «самый дешёвый любой болт», а первого из поиска.
  return pool[0];
}

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
  const skuPrice = resolveProductPrice({}, rows);
  return {
    sku: bestSku.sku || "",
    skuName: bestSku.sku_name || "",
    price:
      Number(bestSku.price) || Number(bestSku.compare_price) || skuPrice || 0,
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

  const best = pickBestInquiryAlternative(alternatives);
  // Только exact/analog дают цену и имя из каталога.
  // similar / size_mismatch / none → «под заказ», без чужой цены 18.50.
  const accepted =
    best && (best.matchType === "exact" || best.matchType === "analog");
  const isAnalog = accepted && best.matchType === "analog";

  // Не найден точный товар и аналог — подсказать ближайший похожий,
  // но НЕ подставлять его цену в строку КП.
  let similarSuggestion = null;
  if (!accepted) {
    const similar = alternatives.find(
      (a) => a.matchType === "similar" && Number(a.price) > 0
    );
    if (similar) {
      similarSuggestion = {
        productId: similar.productId,
        name: similar.name,
        sku: similar.sku,
        price: Number(similar.price) || 0,
        productUrl: similar.productUrl,
      };
    }
  }

  const qty = inquiryLine.quantity || 1;
  const unitPrice = accepted ? Number(best.price) || 0 : 0;
  const hasPrice = unitPrice > 0;
  // Ед. изм. заявки ≠ шт → нельзя молча считать кг штуками: сумму не считаем.
  const unitNeedsRecalc = !!inquiryLine.needsReview;
  const priceWithVat = hasPrice
    ? Number((unitPrice * (1 + VAT_RATE)).toFixed(2))
    : 0;
  const lineTotal =
    hasPrice && !unitNeedsRecalc ? Number((priceWithVat * qty).toFixed(2)) : 0;
  const weightKg = estimateWeightKg(inquiryLine, accepted ? best.name : null);

  let status = inquiryLine.needsReview
    ? STATUS.NEEDS_REVIEW
    : accepted
      ? best.status
      : STATUS.OUT_OF_STOCK;

  // Статус для таблицы КП (фиксированный словарь из регламента КП).
  let kpStatus;
  if (!accepted) {
    kpStatus = "Нет в базе";
  } else if (!hasPrice) {
    kpStatus = "Цена по запросу";
  } else if (unitNeedsRecalc) {
    kpStatus = "Требуется проверка";
  } else {
    kpStatus = isAnalog ? "Предложен аналог" : "Точное соответствие";
  }

  // Комментарий — единый явный текст для UI/КП, без домыслов.
  const commentParts = [];
  if (isAnalog) {
    commentParts.push(
      `АНАЛОГ: вместо «${inquiryLine.name}» предложен «${best.name}»` +
        (best.analogOf ? ` (${best.analogOf})` : "")
    );
  } else if (!accepted) {
    commentParts.push("Точный товар отсутствует. Подходящий аналог не найден");
    if (similarSuggestion) {
      commentParts.push(
        `похожий вариант: «${similarSuggestion.name}» — ${similarSuggestion.price.toFixed(2)} RUB (требует подтверждения)`
      );
    }
  }
  if (accepted && !hasPrice) {
    commentParts.push("Цена в ShopDB отсутствует — цена по запросу");
  }
  if (accepted && hasPrice && unitNeedsRecalc) {
    commentParts.push(
      `Требуется уточнение пересчёта единиц измерения (заявка в «${inquiryLine.unit}»)`
    );
  }
  if (inquiryLine.specialRequirements) {
    commentParts.push(inquiryLine.specialRequirements);
  }

  return {
    inquiryRaw: inquiryLine.raw,
    name: accepted ? best.name : inquiryLine.name,
    requestedName: inquiryLine.name,
    article: accepted ? best.sku || "" : "",
    productId: accepted ? best.productId || "" : "",
    quantity: qty,
    unit: inquiryLine.unit || "шт",
    priceWithVat,
    unitPriceNet: unitPrice,
    lineTotal,
    weightKg,
    status,
    kpStatus,
    unitNeedsRecalc,
    matchType: accepted ? best.matchType : best?.matchType || "none",
    analogOf: accepted ? best.analogOf || null : null,
    similarSuggestion,
    comment: commentParts.join("; "),
    thread: inquiryLine.thread,
    alternatives,
    productUrl: accepted ? best.productUrl : undefined,
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
  pickBestInquiryAlternative,
};
