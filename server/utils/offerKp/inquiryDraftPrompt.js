"use strict";

const INQUIRY_DRAFT_HEADER = "=== ЧЕРНОВИК КП ПО ЗАЯВКЕ (PDF) ===";
const INQUIRY_DRAFT_FOOTER = "=== КОНЕЦ ЧЕРНОВИКА КП ===";

function isInquiryPdfCatalogBlock(text = "") {
  return /\[Каталог[^[\]]*·\s*PDF\]/i.test(String(text || ""));
}

/**
 * Ограничивает число блоков каталога для агента, но не отбрасывает строки PDF-заявки.
 * @param {string[]} blocks
 * @param {number} maxDocs
 * @returns {string[]}
 */
function limitCatalogBlocksForAgent(blocks = [], maxDocs = 5) {
  const list = (blocks || []).filter(Boolean);
  if (!list.length) return [];
  if (list.length <= maxDocs) return list;

  const inquiryBlocks = list.filter(isInquiryPdfCatalogBlock);
  const otherBlocks = list.filter((b) => !isInquiryPdfCatalogBlock(b));

  if (inquiryBlocks.length >= maxDocs) {
    return inquiryBlocks.slice(0, maxDocs);
  }

  const slots = maxDocs - inquiryBlocks.length;
  return [...inquiryBlocks, ...otherBlocks.slice(0, slots)];
}

/**
 * @param {{ lines?: object[] }} draft
 */
function formatInquiryDraftSection(draft) {
  const lines = draft?.lines || [];
  if (!lines.length) return "";

  const rows = lines
    .map((line, idx) => {
      const requested = String(
        line.requestedName || line.inquiryRaw || "—"
      ).replace(/\|/g, "/");
      const matched = String(line.name || "—").replace(/\|/g, "/");
      const qty = line.quantity ?? 1;
      const unit = line.unit || "шт";
      const price =
        Number(line.unitPriceNet) > 0
          ? `${Number(line.unitPriceNet).toFixed(2)} RUB`
          : "— (нет в ShopDB)";
      const productRef = line.productId ? ` · ID ${line.productId}` : "";
      const analogMark =
        line.matchType === "analog"
          ? ` · АНАЛОГ вместо «${requested}»${line.analogOf ? ` (${line.analogOf})` : ""}`
          : "";
      const notFoundMark =
        !(Number(line.unitPriceNet) > 0) && line.matchType !== "analog"
          ? " · нет такого товара в каталоге"
          : "";
      const status = `${line.kpStatus || line.status || "—"}${productRef}${analogMark}${notFoundMark}`;
      return `| ${idx + 1} | ${requested} | ${matched} | ${qty} ${unit} | ${price} | ${status} |`;
    })
    .join("\n");

  return `${INQUIRY_DRAFT_HEADER}
Строк в заявке: ${lines.length}. В итоговом КП должно быть ровно ${lines.length} позиций — по одной на каждую строку ниже.
Количество — только из колонки «Кол-во» PDF (кг/шт).
Цена — ТОЛЬКО из колонки «Цена» этой таблицы (ShopDB / matchInquiryToDraft). Запрещено брать цены из PDF, OCR и «придумывать».
Если в черновике «— (нет в ShopDB)» — оставь цену в КП пустой или напиши «под заказ» (как ChatGPT: пустая колонка цены). Сумму для таких строк — «—». Никогда не подставляй случайные числа вроде 270.10.
Если в статусе «АНАЛОГ вместо …» — обязательно явно напиши в КП, что это АНАЛОГ (точного товара нет, предложена замена). Если «нет такого товара в каталоге» — обязательно явно напиши клиенту, что такого товара нет; не выдавай похожий товар за запрошенный.

| № | Запрошено в PDF | Подобрано из каталога | Кол-во | Цена | Статус |
|---|-----------------|------------------------|--------|------|--------|
${rows}

${INQUIRY_DRAFT_FOOTER}`;
}

function mergeInquiryDraftIntoUserPrompt(userPrompt, draftSection = "") {
  const question = String(userPrompt || "").trim();
  const draft = String(draftSection || "").trim();
  if (!draft) return question;
  if (!question) return draft;
  return `${draft}\n\n${question}`;
}

/**
 * Статус строки КП по регламенту: Точное соответствие / Предложен аналог /
 * Нет в базе / Цена по запросу / Требуется проверка.
 * @param {object} line — строка черновика matchInquiryToDraft
 */
function resolveKpStatus(line = {}) {
  if (line.kpStatus) return line.kpStatus;
  const hasPrice = Number(line.unitPriceNet) > 0;
  const accepted = line.matchType === "exact" || line.matchType === "analog";
  if (!accepted) return "Нет в базе";
  if (!hasPrice) return "Цена по запросу";
  if (line.unitNeedsRecalc) return "Требуется проверка";
  return line.matchType === "analog"
    ? "Предложен аналог"
    : "Точное соответствие";
}

function resolveKpComment(line = {}, kpStatus = "") {
  if (line.comment) return line.comment;
  const requested = line.requestedName || line.inquiryRaw || line.name || "";
  if (kpStatus === "Предложен аналог") {
    return `АНАЛОГ: вместо «${requested}» предложен «${line.name || ""}»${line.analogOf ? ` (${line.analogOf})` : ""}`;
  }
  if (kpStatus === "Нет в базе") {
    let c = "Точный товар отсутствует. Подходящий аналог не найден";
    if (line.similarSuggestion?.name) {
      c += `; похожий вариант: «${line.similarSuggestion.name}» — ${Number(line.similarSuggestion.price || 0).toFixed(2)} RUB (требует подтверждения)`;
    }
    return c;
  }
  if (kpStatus === "Цена по запросу") {
    return "Цена в ShopDB отсутствует — цена по запросу";
  }
  if (kpStatus === "Требуется проверка") {
    return `Требуется уточнение пересчёта единиц измерения (заявка в «${line.unit || "?"}»)`;
  }
  return "";
}

/**
 * Markdown КП строго из черновика ShopDB — агент не должен выдумывать цены/названия.
 * Таблица и статусы — по регламенту автоформирования КП.
 * @param {{ lines?: object[], reference?: string, vatRate?: number }} draft
 * @param {{ title?: string }} [opts]
 */
function buildQuoteMarkdownFromDraft(draft, opts = {}) {
  const lines = draft?.lines || [];
  if (!lines.length) return "";

  const title = opts.title || "Коммерческое предложение · purolat.com";
  const reference = draft.reference ? ` ${draft.reference}` : "";
  const cell = (v) => String(v ?? "—").replace(/\|/g, "/") || "—";

  let subtotal = 0;
  let pricedCount = 0;
  let exactCount = 0;
  let analogCount = 0;
  let notInDbCount = 0;
  let noPriceCount = 0;

  const rows = lines
    .map((line, idx) => {
      const kpStatus = resolveKpStatus(line);
      const comment = resolveKpComment(line, kpStatus);
      const requested = cell(
        line.requestedName || line.inquiryRaw || line.name
      );
      const qty = line.quantity ?? 1;
      const unit = line.unit || "шт";
      const hasPrice = Number(line.unitPriceNet) > 0;
      const unitPrice = hasPrice ? Number(line.unitPriceNet) : 0;

      const isCalculable =
        kpStatus === "Точное соответствие" || kpStatus === "Предложен аналог";
      const offered =
        kpStatus === "Нет в базе" ? "Нет в базе" : cell(line.name);
      const article =
        kpStatus === "Нет в базе" ? "—" : cell(line.article || "—");
      const price = hasPrice
        ? unitPrice.toFixed(2)
        : kpStatus === "Цена по запросу"
          ? "Цена по запросу"
          : "—";
      // Сумма = net × qty (КП без НДС в строках); только для рассчитываемых строк.
      const sum =
        hasPrice && isCalculable
          ? Number((unitPrice * Number(qty)).toFixed(2)).toFixed(2)
          : "—";

      if (kpStatus === "Точное соответствие") exactCount += 1;
      if (kpStatus === "Предложен аналог") analogCount += 1;
      if (kpStatus === "Нет в базе") notInDbCount += 1;
      if (!hasPrice) noPriceCount += 1;
      if (hasPrice && isCalculable) {
        subtotal += unitPrice * Number(qty);
        pricedCount += 1;
      }

      return `| ${idx + 1} | ${requested} | ${offered} | ${article} | ${kpStatus} | ${unit} | ${qty} | ${price} | ${sum} | ${cell(comment || "—")} |`;
    })
    .join("\n");

  const vatRate = Number(draft?.vatRate ?? 0.2);
  const vatAmount = subtotal * vatRate;
  const unpriced = lines.length - pricedCount;
  const note =
    unpriced > 0
      ? "\n> Итоговая сумма рассчитана только по позициям с доступной ценой. Стоимость остальных позиций подлежит уточнению.\n"
      : "";

  return `# ${title}${reference}

**Дата:** ${new Date().toLocaleDateString("ru-RU")}  
**Позиций в заявке:** ${lines.length} (точных: ${exactCount}, аналогов: ${analogCount}, нет в базе: ${notInDbCount}, без цены: ${noPriceCount})

## Перечень позиций

| № | Запрошено клиентом | Предлагаемый товар | Артикул | Статус | Ед. изм. | Количество | Цена | Сумма | Комментарий |
|---|--------------------|--------------------|---------|--------|----------|------------|------|-------|-------------|
${rows}
${note}
## Итого

| Показатель | Значение |
|------------|----------|
| Всего позиций | ${lines.length} |
| Точное соответствие | ${exactCount} |
| Предложен аналог | ${analogCount} |
| Нет в базе | ${notInDbCount} |
| Без цены | ${noPriceCount} |
| Сумма рассчитанных позиций | ${subtotal.toFixed(2)} RUB |
| НДС ${Math.round(vatRate * 100)}% | ${vatAmount.toFixed(2)} RUB |
| **Итог с НДС** | **${(subtotal + vatAmount).toFixed(2)} RUB** |

## Условия

- Цены только из каталога purolat.com (ShopDB). Без цены — «Цена по запросу» / «—», не угадывать.
- Количество и наименования — из заявки клиента.
- Срок действия предложения, доставка и условия оплаты — по согласованию.

_Источник: matchInquiryToDraft / ShopDB_
`;
}

module.exports = {
  INQUIRY_DRAFT_HEADER,
  INQUIRY_DRAFT_FOOTER,
  isInquiryPdfCatalogBlock,
  limitCatalogBlocksForAgent,
  formatInquiryDraftSection,
  mergeInquiryDraftIntoUserPrompt,
  buildQuoteMarkdownFromDraft,
  resolveKpStatus,
  resolveKpComment,
};
