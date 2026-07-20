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

/** Per-thread line match cache: follow-ups should not re-match the whole PDF. */
const LINE_MATCH_CACHE_TTL_MS = 30 * 60 * 1000;
const lineMatchCache = new Map();

function normalizeLineCacheKey(raw = "") {
  return String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getCachedLineMatch(threadId, raw) {
  const key = `${threadId || "global"}::${normalizeLineCacheKey(raw)}`;
  const hit = lineMatchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > LINE_MATCH_CACHE_TTL_MS) {
    lineMatchCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCachedLineMatch(threadId, raw, value) {
  const key = `${threadId || "global"}::${normalizeLineCacheKey(raw)}`;
  lineMatchCache.set(key, { at: Date.now(), value });
  if (lineMatchCache.size > 2000) {
    const oldest = lineMatchCache.keys().next().value;
    lineMatchCache.delete(oldest);
  }
}

function resolveMatchConcurrency(lineCount) {
  const envCap = Number(process.env.OFFER_KP_MATCH_CONCURRENCY);
  if (Number.isFinite(envCap) && envCap > 0) {
    return Math.max(1, Math.min(16, envCap));
  }
  // SQL-heavy matching: raise concurrency for large RFQs.
  if (lineCount > 20) return 8;
  return 4;
}

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
    (a) =>
      a.matchType !== "none" &&
      a.matchType !== "size_mismatch" &&
      a.matchType !== "size_unconfirmed"
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
  const stockByProduct = await fetchProductStocks([productId]);
  return stockByProduct.get(String(productId)) || emptyProductStock();
}

function emptyProductStock() {
  return {
    sku: "",
    skuName: "",
    price: 0,
    stockCount: 0,
    skus: [],
  };
}

async function fetchProductStocks(productIds = []) {
  const ids = [
    ...new Set(
      productIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  const byProduct = new Map();
  if (!ids.length) return byProduct;

  const placeholders = ids.map(() => "?").join(",");
  const rows = await query(
    `SELECT ${S.productId} AS product_id, ${S.sku} AS sku,
            ${S.name} AS sku_name, price, compare_price, count, available
     FROM ${TABLES.productSkus}
     WHERE ${S.productId} IN (${placeholders})
     ORDER BY ${S.productId}, count DESC`,
    ids
  );

  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.product_id);
    if (!grouped.has(key)) grouped.set(key, []);
    const group = grouped.get(key);
    if (group.length < 5) group.push(row);
  }

  for (const id of ids) {
    const key = String(id);
    const skus = grouped.get(key) || [];
    const totalStock = skus.reduce(
      (sum, row) => sum + (Number(row.count) || 0),
      0
    );
    const bestSku = skus[0] || {};
    const skuPrice = resolveProductPrice({}, skus);
    byProduct.set(key, {
      sku: bestSku.sku || "",
      skuName: bestSku.sku_name || "",
      price:
        Number(bestSku.price) || Number(bestSku.compare_price) || skuPrice || 0,
      stockCount: totalStock,
      skus,
    });
  }
  return byProduct;
}

// Строка-заглушка для позиции, на которой сопоставление упало с ошибкой
// (например, обрыв соединения с MySQL). Ошибка ОДНОЙ строки не должна
// обнулять цены всей котировки — см. matchInquiryToDraft.
function buildLineMatchErrorFallback(inquiryLine, error) {
  const quantity = Number(inquiryLine.quantity);
  console.error(
    `[offerKp] matchInquiryLine failed for "${inquiryLine.raw}":`,
    error?.message || error
  );
  return {
    inquiryRaw: inquiryLine.raw,
    name: inquiryLine.name || inquiryLine.raw,
    requestedName: inquiryLine.name || inquiryLine.raw,
    article: "",
    productId: "",
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit: inquiryLine.unit || "шт",
    priceWithVat: 0,
    unitPriceNet: 0,
    lineTotal: 0,
    weightKg: 0,
    lineWeightKg: 0,
    status: STATUS.NEEDS_REVIEW,
    kpStatus: "Требуется проверка",
    unitNeedsRecalc: true,
    matchType: "none",
    analogOf: null,
    similarSuggestion: null,
    comment:
      "Ошибка при проверке базы данных для этой позиции — требуется повторная проверка",
    thread: inquiryLine.thread,
    alternatives: [],
    matchError: true,
  };
}

async function matchInquiryLine(inquiryLine, options = {}) {
  const cacheRaw = inquiryLine.raw || inquiryLine.name;
  const cached = getCachedLineMatch(options.threadId, cacheRaw);
  if (cached) return { ...cached, quantity: inquiryLine.quantity || cached.quantity };

  const searchText = inquiryLine.raw || inquiryLine.name;
  let { products } = await runProductSearchAgent({
    message: searchText,
    chatHistory: options.chatHistory,
    workspace: options.workspace,
    limit: 8,
    // A single inquiry line must be ranked on its own. Prepending the complete
    // PDF made every line share almost the same search text and candidates.
    parsedFileTexts: null,
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

  const candidates = products.slice(0, 5);
  const stockByProduct = await fetchProductStocks(candidates.map((p) => p.id));
  const alternatives = candidates.map((product) => {
    const stock = stockByProduct.get(String(product.id)) || emptyProductStock();
    const classification = classifyProductMatch(searchText, {
      ...product,
      ...stock,
    });
    return {
      productId: String(product.id),
      name: product.name,
      sku: stock.sku,
      price: stock.price || resolveProductPrice(product) || 0,
      stockCount: stock.stockCount,
      matchType: classification.matchType,
      status: classification.status,
      analogOf: classification.analogOf,
      mismatchReason: classification.mismatchReason || null,
      productUrl: product.product_url || product.url,
    };
  });

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
  // Canonical quote contract: unitPriceNet/lineTotal/subtotal are net values;
  // priceWithVat is the gross value used by 1C/XLSX and editable UI fields.
  const lineTotal =
    hasPrice && !unitNeedsRecalc ? Number((unitPrice * qty).toFixed(2)) : 0;
  const weightKg = estimateWeightKg(inquiryLine, accepted ? best.name : null);
  const lineWeightKg =
    inquiryLine.unit === "кг" ? qty : Number((weightKg * qty).toFixed(4));

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
    if (best?.matchType === "spec_mismatch") {
      const labels = {
        product_type: "тип изделия",
        coating: "покрытие",
        strength_class: "класс прочности",
      };
      commentParts.push(
        `ближайший кандидат отличается: ${labels[best.mismatchReason] || "характеристики"}`
      );
    }
    if (best?.matchType === "size_unconfirmed") {
      commentParts.push(
        "в заявке не указан точный размер (M×L) — совпадение по стандарту найдено, но размер кандидата не подтверждён, требуется ручная проверка"
      );
    }
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

  const matchedLine = {
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
    lineWeightKg,
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
  setCachedLineMatch(options.threadId, cacheRaw, matchedLine);
  return matchedLine;
}

function estimateWeightKg(inquiryLine, productName) {
  // A quantity expressed in kg is the total requested line weight, not the
  // weight of one piece. Returning it as per-unit weight would square it later.
  if (inquiryLine.unit === "кг") return 0;
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

function calculateTotalWeightKg(lines = []) {
  return lines.reduce((sum, line) => {
    if (Number.isFinite(Number(line.lineWeightKg))) {
      return sum + Number(line.lineWeightKg);
    }
    if (line.unit === "кг") return sum + (Number(line.quantity) || 0);
    return sum + (Number(line.weightKg) || 0) * (Number(line.quantity) || 1);
  }, 0);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await mapper(items[index], index);
      }
    }
  );
  await Promise.all(workers);
  return results;
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

  const concurrency = resolveMatchConcurrency(lines.length);
  const onProgress =
    typeof options.onProgress === "function" ? options.onProgress : null;
  let completed = 0;
  let lastEmitAt = 0;
  const partialLines = new Array(lines.length);

  const matched = await mapWithConcurrency(lines, concurrency, async (line, index) => {
    try {
      const result = await matchInquiryLine(line, {
        ...options,
        parsedFileTexts: options.parsedFileTexts || null,
      });
      partialLines[index] = result;
      completed += 1;
      const now = Date.now();
      // Emit ~every 400ms or on first/last line to avoid SSE flood.
      if (
        onProgress &&
        (completed === 1 ||
          completed === lines.length ||
          now - lastEmitAt >= 400)
      ) {
        lastEmitAt = now;
        const ready = partialLines.filter(Boolean);
        onProgress({
          progressStage: "searching",
          lineCount: lines.length,
          matchedCount: completed,
          total: lines.length,
          quoteDraft: {
            step: 2,
            hardwareLines: ready,
            preview: {
              lines: ready,
              subtotal: 0,
              total: 0,
              totalWeightKg: 0,
            },
          },
        });
      }
      return result;
    } catch (e) {
      // Ошибка на одной позиции (например, обрыв MySQL) не должна отбрасывать
      // все уже успешно сопоставленные и оценённые строки заявки.
      const fallback = buildLineMatchErrorFallback(line, e);
      partialLines[index] = fallback;
      completed += 1;
      return fallback;
    }
  });

  const draft = buildDraftFromMatchedLines(matched);
  if (onProgress) {
    onProgress({
      progressStage: "matched",
      lineCount: lines.length,
      matchedCount: lines.length,
      total: lines.length,
      quoteDraft: {
        step: 2,
        reference: draft.reference,
        hardwareLines: draft.lines,
        preview: {
          lines: draft.lines,
          subtotal: draft.subtotal,
          total: draft.total,
          totalWeightKg: draft.totalWeightKg,
        },
      },
    });
  }
  return draft;
}

function buildDraftFromMatchedLines(matched = []) {
  const subtotal = matched.reduce(
    (sum, line) => sum + (Number(line.lineTotal) || 0),
    0
  );
  const totalWeightKg = calculateTotalWeightKg(matched);
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
  buildLineMatchErrorFallback,
  fetchProductStock,
  fetchProductStocks,
  pickBestInquiryAlternative,
  calculateTotalWeightKg,
  buildDraftFromMatchedLines,
};
