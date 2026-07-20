"use strict";

const { parseInquiryText } = require("./parseInquiry");
const {
  assessInquiryTextQuality,
  validateInquiryLines,
} = require("./inquiryTextQuality");

const UNREADABLE_MARKER = "[НЕРАЗБОРЧИВО — ТРЕБУЕТ ПРОВЕРКИ]";

function normalizeUnit(value = "") {
  const unit = String(value || "")
    .trim()
    .toLowerCase();
  if (/^(?:кг|kg)$/.test(unit)) return "кг";
  if (/^(?:шт\.?|pcs|pieces|szt\.?)$/.test(unit)) return "шт";
  return unit;
}

function stripItemQuantity(raw = "") {
  return String(raw || "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(
      /\s+\d+(?:[.,]\d+)?\s*(?:кг|kg|шт\.?|штук|pcs|pieces|szt\.?)\s*$/i,
      ""
    )
    .trim();
}

function hasPriceColumns(text = "") {
  const lines = String(text || "").split(/\r?\n/);
  return lines.some((line) => {
    if (!/цен|price|cena|стоимост|сумм/i.test(line)) return false;
    return /наимен|товар|описан|колич|кол-?во|qty|ед\.?\s*изм|unit/i.test(line);
  });
}

function detectPeriod(text = "") {
  const raw = String(text || "");
  const halfYear = raw.match(
    /(?:перв(?:ое|ый)|втор(?:ое|ой))\s+полугоди[ея]\s+20\d{2}\s*(?:года|г\.?)?/i
  );
  if (halfYear) return halfYear[0].trim();
  const range = raw.match(
    /(?:период|срок|потребност)[^\n:]*[:\-]?\s*([^\n]{4,80})/i
  );
  return range?.[1]?.trim() || null;
}

function detectNamedParty(text = "", patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function splitVerbatimColumns(line = "") {
  const raw = String(line || "").trim();
  if (!raw) return [];
  if (/\t|\|/.test(raw)) {
    return raw
      .split(/\t|\|/)
      .map((cell) => cell.trim())
      .filter(Boolean);
  }
  return raw
    .split(/\s{2,}/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function extractVerbatimItems(text = "") {
  const items = [];
  const unitRe = /^(?:кг|kg|шт\.?|штук|pcs|pieces|szt\.?)$/i;

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = splitVerbatimColumns(line);
    if (cols.length >= 4 && /^\d+[.)]?$/.test(cols[0])) {
      const number = Number(cols[0].replace(/[.)]/g, ""));
      const unitIdx = cols.findIndex(
        (cell, index) => index > 0 && unitRe.test(cell)
      );
      if (unitIdx < 0) continue;
      const quantityIdx = cols.findIndex(
        (cell, index) =>
          index > 0 &&
          index !== unitIdx &&
          /^\d+(?:[.,]\d+)?$/.test(cell) &&
          index > unitIdx
      );
      let fallbackQuantityIdx = -1;
      for (let index = cols.length - 1; index > 0; index--) {
        if (
          index !== unitIdx &&
          /^\d+(?:[.,]\d+)?$/.test(cols[index])
        ) {
          fallbackQuantityIdx = index;
          break;
        }
      }
      const qtyIdx = quantityIdx >= 0 ? quantityIdx : fallbackQuantityIdx;
      if (qtyIdx < 0) continue;
      const nameEnd = Math.min(unitIdx, qtyIdx);
      const name = cols.slice(1, nameEnd).join(" ").trim();
      if (!name) continue;
      items.push({
        number,
        name,
        raw: line,
        unit: normalizeUnit(cols[unitIdx]),
        quantity: Number(cols[qtyIdx].replace(",", ".")),
      });
      continue;
    }

    const inline = line.match(
      /^\s*(\d+)[.)]\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(кг|kg|шт\.?|штук|pcs|pieces|szt\.?)\s*$/i
    );
    if (!inline) continue;
    items.push({
      number: Number(inline[1]),
      name: inline[2].trim(),
      raw: line,
      unit: normalizeUnit(inline[4]),
      quantity: Number(inline[3].replace(",", ".")),
    });
  }

  const sequential = items.every((item, index) => item.number === index + 1);
  return sequential ? items : [];
}

function analyzeQuoteSourceDocuments(documents = []) {
  const docs = (documents || []).filter((doc) => doc?.pageContent?.trim());
  const combined = docs
    .map((doc) => doc.pageContent)
    .join("\n\n")
    .trim();
  const parsedLines = parseInquiryText(combined).filter((line) =>
    /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:кг|kg|шт\.?|штук|pcs|pieces|szt\.?)\s*$/i.test(
      String(line?.raw || "")
    )
  );
  const quality = assessInquiryTextQuality(combined);
  const lineIssues = validateInquiryLines(parsedLines);
  const unreadableFragments = (
    combined.match(/\[?НЕРАЗБОРЧИВО[^\]\n]*\]?/gi) || []
  ).length;

  const verbatimItems = extractVerbatimItems(combined);
  const items = verbatimItems.length
    ? verbatimItems
    : parsedLines.map((line, index) => ({
        number: index + 1,
        name: stripItemQuantity(line.raw || line.name),
        raw: line.raw || line.name,
        unit: normalizeUnit(line.unit),
        quantity: Number(line.quantity),
      }));
  const units = [...new Set(items.map((item) => item.unit).filter(Boolean))];
  const firstNonEmptyLine = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return {
    sourceAvailable: docs.length > 0,
    sourceVerified:
      docs.length > 0 &&
      quality.ok &&
      lineIssues.length === 0 &&
      items.length > 0,
    pageCount: docs.length,
    documentType: docs.some((doc) => /\.pdf(?:$|-)/i.test(doc.title || ""))
      ? "PDF"
      : "parsed document",
    title: firstNonEmptyLine || docs[0]?.title || null,
    period: detectPeriod(combined),
    pricesPresent: hasPriceColumns(combined),
    supplier:
      detectNamedParty(combined, [
        /(?:поставщик|supplier)\s*[:\-]\s*([^\n|]+)/i,
      ]) || null,
    customer:
      detectNamedParty(combined, [
        /(?:заказчик|клиент|customer)\s*[:\-]\s*([^\n|]+)/i,
      ]) || null,
    unreadableFragments,
    quality,
    lineIssues,
    items,
    itemCount: items.length,
    units,
  };
}

function normalizeName(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[×хХ]/g, "x")
    .replace(/[–—−]/g, "-")
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function technicalTokens(value = "") {
  return (
    normalizeName(value).match(
      /(?:din|gost|гост)\s*\d+|m\s*\d+(?:\s*x\s*\d+)?|\d+\s*x\s*\d+/gi
    ) || []
  );
}

function verifySourceDeclaration(payload = {}, analysis = {}) {
  const errors = [];
  const expected = Number(analysis.itemCount || 0);
  const declaredExpected = Number(payload.items_expected);
  const declaredExtracted = Number(payload.items_extracted);
  const declaredItems = Array.isArray(payload.items) ? payload.items : [];

  if (!analysis.sourceVerified) {
    errors.push("Исходный файл не прошёл серверную проверку качества.");
  }
  if (payload.source_verified !== true) {
    errors.push("source_verified должно иметь значение true.");
  }
  if (payload.ready_to_generate !== true) {
    errors.push("ready_to_generate должно иметь значение true.");
  }
  if (declaredExpected !== expected || declaredExtracted !== expected) {
    errors.push(
      `Количество позиций не совпадает: источник=${expected}, expected=${declaredExpected}, extracted=${declaredExtracted}.`
    );
  }
  if (Boolean(payload.prices_present) !== Boolean(analysis.pricesPresent)) {
    errors.push("Признак наличия цен не совпадает с исходным документом.");
  }
  if (declaredItems.length !== expected) {
    errors.push(
      `Для построчной проверки передано ${declaredItems.length} из ${expected} позиций.`
    );
  }

  for (
    let index = 0;
    index < Math.min(expected, declaredItems.length);
    index++
  ) {
    const source = analysis.items[index];
    const declared = declaredItems[index] || {};
    if (Number(declared.number) !== index + 1) {
      errors.push(`Нарушена последовательность номеров в строке ${index + 1}.`);
      break;
    }
    if (Number(declared.quantity) !== Number(source.quantity)) {
      errors.push(`Количество не совпадает в строке ${index + 1}.`);
      break;
    }
    if (normalizeUnit(declared.unit) !== normalizeUnit(source.unit)) {
      errors.push(`Единица измерения не совпадает в строке ${index + 1}.`);
      break;
    }
    const declaredName = normalizeName(declared.name);
    const sourceTokens = technicalTokens(source.name);
    if (
      !declaredName ||
      sourceTokens.some((token) => !declaredName.includes(normalizeName(token)))
    ) {
      errors.push(
        `Техническое обозначение не совпадает в строке ${index + 1}.`
      );
      break;
    }
    if (
      /НЕРАЗБОРЧИВО/i.test(source.name) &&
      !/НЕРАЗБОРЧИВО/i.test(String(declared.name || ""))
    ) {
      errors.push(`Нечитаемый фрагмент не отмечен в строке ${index + 1}.`);
      break;
    }
  }

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    source_report: {
      pages: analysis.pageCount || 0,
      document_type: analysis.documentType || null,
      title: analysis.title || null,
      period: analysis.period || null,
      items: expected,
      units: analysis.units || [],
      prices_present: Boolean(analysis.pricesPresent),
      supplier_present: Boolean(analysis.supplier),
      customer_present: Boolean(analysis.customer),
      unreadable_fragments: analysis.unreadableFragments || 0,
    },
    final_check: {
      all_items_from_source: ok,
      item_count_matches: ok,
      units_match: ok,
      quantities_match: ok,
      invented_data_absent: ok,
      unreadable_fragments_marked: ok,
    },
    verification: {
      source_verified: ok,
      items_expected: expected,
      items_extracted: ok ? expected : declaredItems.length,
      prices_present: Boolean(analysis.pricesPresent),
      ready_to_generate: ok,
    },
  };
}

function escapeTableCell(value = "") {
  return String(value || "")
    .replace(/\|/g, "/")
    .trim();
}

function buildSourceOnlyQuoteMarkdown(analysis = {}) {
  const pending = "уточняется";
  const rows = (analysis.items || [])
    .map(
      (item) =>
        `| ${item.number} | ${escapeTableCell(item.name)} | ${escapeTableCell(item.unit)} | ${item.quantity} | ${pending} | ${pending} |`
    )
    .join("\n");
  const period = analysis.period || "[Указать период]";

  return `# КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ

## На поставку болтов с гайками

**Поставщик:** ${analysis.supplier || "[Указать поставщика]"}<br>
**Заказчик:** ${analysis.customer || "[Указать заказчика]"}<br>
**Дата:** [Указать дату]

**Основание:** заявка клиента из приложенного файла.<br>
**Период потребности:** ${period}.

| № | Наименование товара | Ед. изм. | Количество | Цена за единицу | Сумма |
|---|----------------------|----------|------------|------------------|-------|
${rows}

**Статус:** Для расчёта стоимости необходимо получить цены поставщика.

Стоимость товаров, НДС, сроки поставки, условия оплаты и доставки подлежат согласованию после получения цен и коммерческих условий от поставщика.
`;
}

module.exports = {
  UNREADABLE_MARKER,
  analyzeQuoteSourceDocuments,
  buildSourceOnlyQuoteMarkdown,
  extractVerbatimItems,
  normalizeUnit,
  stripItemQuantity,
  verifySourceDeclaration,
};
