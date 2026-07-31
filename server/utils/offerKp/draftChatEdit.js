"use strict";

/**
 * Apply free-form chat commands to the current quote draft (Сводка позиций).
 * Operator overrides (price/qty/customer/remove) — not ShopDB inventing prices.
 * Also recognizes UI button labels (e.g. «Дешёвые аналоги») as the same actions.
 */

const { matchUiDraftCommand, isUiDraftCommand } = require("./uiDraftCommands");
const {
  resolveCheapestAnalogsForLines,
  altPatchForLine,
  explainCheapestAnalogsEmpty,
} = require("./pickCheapestAnalog");

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[×х]/giu, "x")
    .replace(/гост\s*р?/giu, "gost")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value = "") {
  return normalizeText(value)
    .split(" ")
    .filter((t) => t.length >= 2);
}

function lineSearchBlob(line = {}) {
  return normalizeText(
    [
      line.requestedName,
      line.inquiryRaw,
      line.name,
      line.productName,
      line.article,
      line.sku,
      line.analogOf,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function scoreLineAgainstMessage(messageNorm, line) {
  const blob = lineSearchBlob(line);
  if (!blob) return 0;
  if (messageNorm.includes(blob) || blob.includes(messageNorm)) return 100;

  const msgTokens = new Set(tokenize(messageNorm));
  const lineTokens = tokenize(blob);
  if (!lineTokens.length || !msgTokens.size) return 0;

  let hit = 0;
  for (const token of lineTokens) {
    if (msgTokens.has(token)) hit += 1;
  }
  let bonus = 0;
  for (const token of lineTokens) {
    if (/^m?\d+x\d+$/i.test(token) && msgTokens.has(token)) bonus += 3;
    if (/^\d{3,5}(?:-\d+)?$/.test(token) && msgTokens.has(token)) bonus += 2;
  }
  return hit + bonus;
}

/**
 * @param {string} message
 * @param {object[]} lines
 * @returns {number} index or -1
 */
function findTargetLineIndex(message, lines = []) {
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length) return -1;

  const rowMatch = String(message || "").match(
    /(?:строк[ауие]?|позици[яиею]|wiersz(?:u|e)?|line|row)\s*[#№]?\s*(\d{1,3})\b/iu
  );
  if (rowMatch) {
    const n = Number(rowMatch[1]);
    if (Number.isInteger(n) && n >= 1 && n <= list.length) return n - 1;
  }

  const messageNorm = normalizeText(message);
  let bestIdx = -1;
  let bestScore = 0;
  list.forEach((line, index) => {
    const score = scoreLineAgainstMessage(messageNorm, line);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = index;
    }
  });

  return bestScore >= 2 ? bestIdx : -1;
}

function parseMoneyAmount(raw) {
  const n = Number(String(raw || "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function extractPriceAmount(message = "") {
  const text = String(message || "");
  const patterns = [
    /(?:цен[аыуе]|стоимост\w*|price|cena).{0,240}?(?:поставь|вставь|исправь|поправь|проставь|укажи|замени|zmie[nń]|wstaw|ustaw|set|zmień).{0,48}?(\d+(?:[.,]\d+)?)\s*(?:руб(?:\.|ля|лей)?|rub|₽|pln|zł)?/iu,
    /(?:поставь|вставь|исправь|поправь|проставь|wstaw|ustaw|set).{0,60}?(?:цен[уыа]|стоимост\w*|price|cena).{0,40}?(\d+(?:[.,]\d+)?)/iu,
    /(?:в\s+кп|в\s+сводк|в\s+черновик|w\s+kp|w\s+ofercie).{0,48}?(?:вставь|поставь|wstaw|ustaw).{0,24}?(\d+(?:[.,]\d+)?)\s*(?:руб(?:\.|ля|лей)?|rub|₽|pln|zł)?/iu,
    /(?:wstaw|ustaw|поставь|вставь).{0,24}?(\d+(?:[.,]\d+)?)\s*(?:руб(?:\.|ля|лей)?|rub|₽)\b/iu,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const amount = parseMoneyAmount(m[1]);
      if (amount != null) return amount;
    }
  }

  if (
    /(?:цен[аыуе]|cena|price).{0,80}(?:неправильн|ошиб|niepopraw|wrong|incorrect|fix)/iu.test(
      text
    ) ||
    /(?:неправильн|ошиб|niepopraw).{0,80}(?:цен|cena|price)/iu.test(text)
  ) {
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:руб(?:\.|ля|лей)?|rub|₽)\b/iu);
    if (m) return parseMoneyAmount(m[1]);
  }
  return null;
}

function extractQuantity(message = "") {
  const text = String(message || "");
  const patterns = [
    /(?:количеств[оаеу]|qty|ilo[sś][cć]|кол-?во).{0,40}?(?:поставь|вставь|исправь|укажи|zmie[nń]|wstaw|ustaw|на|=|:)?\s*(\d+(?:[.,]\d+)?)\s*(?:шт|штук|kg|кг)?/iu,
    /(?:поставь|вставь|исправь|укажи|wstaw|ustaw).{0,40}?(?:количеств|qty|ilo[sś][cć]|кол-?во).{0,20}?(\d+(?:[.,]\d+)?)/iu,
    /(?:поставь|вставь|wstaw)\s+(\d+)\s*(?:шт|штук)\b/iu,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(String(m[1]).replace(",", "."));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function extractCustomerName(message = "") {
  const text = String(message || "");
  const m = text.match(
    /(?:покупател[ьяю]|customer|nabywc[aą]|klient).{0,20}?(?:поставь|укажи|замени|переименуй|wstaw|ustaw|zmie[nń]|на|=|:)\s*[«"']?([^»"'\n]{2,120})/iu
  );
  if (!m) return null;
  return String(m[1] || "")
    .replace(/[.,;]+$/g, "")
    .trim();
}

function wantsRemoveLine(message = "") {
  return /(?:удали|убери|usu[nń]|remove|delete).{0,40}(?:строк|позиц|wiersz|line|row|товар)/iu.test(
    String(message || "")
  );
}

function looksLikeDraftEdit(message = "") {
  const text = String(message || "").trim();
  if (!text) return false;
  if (isUiDraftCommand(text)) return true;
  if (extractPriceAmount(text) != null) return true;
  if (extractQuantity(text) != null) return true;
  if (extractCustomerName(text)) return true;
  if (wantsRemoveLine(text)) return true;
  return /(?:в\s+кп|в\s+сводк|в\s+черновик|w\s+kp|edit\s+quote|исправь|поправь|поставь|вставь|wstaw|ustaw).{0,80}(?:цен|количеств|строк|позиц|покупател|cena|qty|wiersz)/iu.test(
    text
  );
}

function applyCheapestAnalogsCommand(prev, lines, vatRate) {
  const picks = resolveCheapestAnalogsForLines(lines);
  if (!picks.length) {
    const reason = explainCheapestAnalogsEmpty(lines);
    const replyByReason = {
      out_of_stock:
        "Все позиции сейчас без наличия на складе — дешёвые аналоги из меню нечего подставить. Проверьте статус или откройте «Аналоги» вручную.",
      already_best:
        "Уже выбран лучший вариант из наличия с ценой — менять нечего.",
      no_menu:
        "У позиций нет меню «Аналоги» (≥2 варианта). Откройте сводку после сопоставления с каталогом.",
      no_priced_stock:
        "В меню «Аналоги» нет вариантов одновременно в наличии и с ценой из каталога.",
      empty:
        "Нет строк черновика для подстановки аналогов.",
    };
    return {
      ok: false,
      applied: [],
      quoteDraft: prev,
      reply: replyByReason[reason] || replyByReason.no_priced_stock,
      reason: `cheapest_analogs_${reason}`,
    };
  }

  const byIndex = new Map(picks.map((p) => [p.index, p.alt]));
  const nextLines = lines.map((line, i) => {
    const alt = byIndex.get(i);
    if (!alt) return line;
    return recalcLineTotals({ ...line, ...altPatchForLine(alt, vatRate) }, vatRate);
  });
  const totals = summarizeDraft(nextLines, vatRate);
  const quoteDraft = {
    ...prev,
    hardwareLines: nextLines,
    preview: {
      ...(prev.preview || {}),
      lines: nextLines,
      subtotal: totals.subtotal,
      total: totals.total,
      totalWeightKg: totals.totalWeightKg,
    },
  };
  const applied = picks.map((p) => ({
    op: "cheapest_analog",
    index: p.index,
    sku: p.alt?.sku || "",
    name: p.alt?.name || p.line?.name || "",
    price: Number(p.alt?.price || p.alt?.unitPriceNet) || 0,
  }));

  return {
    ok: true,
    applied,
    quoteDraft,
    reply: `Готово. Подставил дешёвые аналоги из наличия с ценой: ${picks.length} поз. Проверьте вкладку «Сводка позиций».`,
  };
}

function recalcLineTotals(line, vatRate = 0.2) {
  const qty = Math.max(0, Number(line.quantity) || 0);
  const net = Number(line.unitPriceNet);
  const gross =
    Number.isFinite(net) && net > 0
      ? Number((net * (1 + vatRate)).toFixed(2))
      : Number(line.priceWithVat) || 0;
  const unitPriceNet =
    Number.isFinite(net) && net > 0
      ? Number(net.toFixed(2))
      : gross > 0
        ? Number((gross / (1 + vatRate)).toFixed(2))
        : 0;
  const priceWithVat =
    unitPriceNet > 0
      ? Number((unitPriceNet * (1 + vatRate)).toFixed(2))
      : Number(line.priceWithVat) || 0;
  const lineTotal = Number((qty * unitPriceNet).toFixed(2));
  return {
    ...line,
    unitPriceNet,
    priceWithVat,
    lineTotal,
    allowPrice: unitPriceNet > 0 ? true : line.allowPrice,
  };
}

function summarizeDraft(lines = [], vatRate = 0.2) {
  const subtotal = lines.reduce(
    (sum, line) => sum + (Number(line.lineTotal) || 0),
    0
  );
  const totalWeightKg = lines.reduce((sum, line) => {
    const w =
      Number(line.totalWeightKg) ||
      (Number(line.weightKg) || 0) * (Number(line.quantity) || 0) ||
      0;
    return sum + w;
  }, 0);
  return {
    subtotal: Number(subtotal.toFixed(2)),
    total: Number(subtotal.toFixed(2)),
    totalWeightKg: Number(totalWeightKg.toFixed(3)),
    vatRate,
  };
}

/**
 * @param {{
 *   message: string,
 *   quoteDraft?: object|null,
 *   vatRate?: number,
 *   resolvedCommand?: string|null,
 *   commandPlan?: {command?: string,target?: string,value?: string,row?: number}|null,
 * }} input
 */
function applyDraftChatEdits(input = {}) {
  const message = String(input.message || "").trim();
  const vatRate =
    Number.isFinite(Number(input.vatRate)) && Number(input.vatRate) >= 0
      ? Number(input.vatRate)
      : 0.2;
  const prev =
    input.quoteDraft && typeof input.quoteDraft === "object"
      ? input.quoteDraft
      : null;
  const lines = [
    ...((prev?.hardwareLines || prev?.preview?.lines || []).map((l) => ({
      ...l,
    })) || []),
  ];

  const commandPlan =
    input.commandPlan && typeof input.commandPlan === "object"
      ? input.commandPlan
      : null;
  const plannedCommand = String(commandPlan?.command || "").trim();
  const resolvedCommand = String(input.resolvedCommand || "").trim();
  const uiCommand =
    plannedCommand === "quote_apply_cheapest_analogs"
      ? "cheapest_analogs"
      : resolvedCommand === "cheapest_analogs"
        ? resolvedCommand
        : matchUiDraftCommand(message);
  const hasPlannedEdit = /^quote_(?:set_|remove_)/u.test(plannedCommand);

  if (!prev || !lines.length) {
    return {
      ok: false,
      applied: [],
      quoteDraft: prev,
      reply: uiCommand
        ? "Сначала нужна сводка позиций КП. Загрузите заявку или сформируйте черновик, затем повторите команду кнопки."
        : "",
      reason: "no_draft",
    };
  }
  if (!uiCommand && !hasPlannedEdit && !looksLikeDraftEdit(message)) {
    return {
      ok: false,
      applied: [],
      quoteDraft: prev,
      reply: "",
      reason: "not_an_edit",
    };
  }

  if (uiCommand === "cheapest_analogs") {
    return applyCheapestAnalogsCommand(prev, lines, vatRate);
  }

  const applied = [];
  let nextLines = lines;
  let nextCustomer = { ...(prev.customer || {}) };

  const customerName =
    plannedCommand === "quote_set_customer"
      ? String(commandPlan?.value || "").trim()
      : extractCustomerName(message);
  if (customerName) {
    nextCustomer = { ...nextCustomer, name: customerName };
    applied.push({ op: "set_customer", name: customerName });
  }

  const price =
    plannedCommand === "quote_set_price"
      ? parseMoneyAmount(commandPlan?.value)
      : extractPriceAmount(message);
  const qty =
    plannedCommand === "quote_set_quantity"
      ? parseMoneyAmount(commandPlan?.value)
      : extractQuantity(message);
  const remove =
    plannedCommand === "quote_remove_line" || wantsRemoveLine(message);
  const needsLine = price != null || qty != null || remove;

  if (needsLine) {
    const plannedRow = Number(commandPlan?.row);
    const index =
      Number.isInteger(plannedRow) &&
      plannedRow >= 1 &&
      plannedRow <= nextLines.length
        ? plannedRow - 1
        : findTargetLineIndex(
            commandPlan?.target ? String(commandPlan.target) : message,
            nextLines
          );
    if (index < 0) {
      return {
        ok: false,
        applied: [],
        quoteDraft: prev,
        reply:
          "Не нашёл строку в сводке по вашему описанию. Уточните номер строки (например «строка 4») или наименование/артикул.",
        reason: "line_not_found",
      };
    }

    if (remove) {
      const removed = nextLines[index];
      nextLines = nextLines.filter((_, i) => i !== index);
      applied.push({
        op: "remove_line",
        index,
        name: removed?.name || removed?.requestedName || "",
      });
    } else {
      let line = { ...nextLines[index] };
      if (price != null) {
        line.unitPriceNet = Number(price.toFixed(2));
        line.priceWithVat = Number((price * (1 + vatRate)).toFixed(2));
        line.allowPrice = true;
        line.operatorPriceOverride = true;
        line.status =
          line.status && !/нет в базе/i.test(line.status)
            ? line.status
            : "Цена оператора";
        line.kpStatus = "Цена оператора";
        line.comment = [line.comment, `Цена задана оператором: ${price} RUB`]
          .filter(Boolean)
          .join("; ")
          .slice(0, 240);
        if (!["exact", "analog"].includes(String(line.matchType || ""))) {
          line.matchType = "analog";
          line.analogOf =
            line.analogOf ||
            line.requestedName ||
            line.inquiryRaw ||
            "операторская цена";
        }
        applied.push({
          op: "set_price",
          index,
          price,
          name: line.name || line.requestedName || "",
        });
      }
      if (qty != null) {
        line.quantity = qty;
        applied.push({
          op: "set_quantity",
          index,
          quantity: qty,
          name: line.name || line.requestedName || "",
        });
      }
      line = recalcLineTotals(line, vatRate);
      nextLines = nextLines.map((l, i) => (i === index ? line : l));
    }
  }

  if (!applied.length) {
    return {
      ok: false,
      applied: [],
      quoteDraft: prev,
      reply: "",
      reason: "no_ops",
    };
  }

  const totals = summarizeDraft(nextLines, vatRate);
  const quoteDraft = {
    ...prev,
    customer: nextCustomer,
    hardwareLines: nextLines,
    preview: {
      ...(prev.preview || {}),
      lines: nextLines,
      subtotal: totals.subtotal,
      total: totals.total,
      totalWeightKg: totals.totalWeightKg,
    },
  };

  const bits = applied.map((op) => {
    if (op.op === "set_price") {
      return `цена строки «${op.name || `#${op.index + 1}`}» → ${op.price} RUB`;
    }
    if (op.op === "set_quantity") {
      return `кол-во «${op.name || `#${op.index + 1}`}» → ${op.quantity}`;
    }
    if (op.op === "remove_line") {
      return `удалена строка «${op.name || `#${op.index + 1}`}»`;
    }
    if (op.op === "set_customer") {
      return `покупатель → ${op.name}`;
    }
    if (op.op === "cheapest_analog") {
      return `аналог «${op.name || op.sku || `#${op.index + 1}`}»`;
    }
    return op.op;
  });

  return {
    ok: true,
    applied,
    quoteDraft,
    reply: `Готово. Обновил сводку позиций: ${bits.join("; ")}. Проверьте вкладку «Сводка позиций».`,
  };
}

module.exports = {
  normalizeText,
  findTargetLineIndex,
  extractPriceAmount,
  extractQuantity,
  extractCustomerName,
  looksLikeDraftEdit,
  applyDraftChatEdits,
  recalcLineTotals,
  isUiDraftCommand,
  matchUiDraftCommand,
};
