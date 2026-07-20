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
      const status = `${line.status || "—"}${productRef}${analogMark}${notFoundMark}`;
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
 * Markdown КП строго из черновика ShopDB — агент не должен выдумывать цены/названия.
 * @param {{ lines?: object[], reference?: string }} draft
 * @param {{ title?: string }} [opts]
 */
function buildQuoteMarkdownFromDraft(draft, opts = {}) {
  const lines = draft?.lines || [];
  if (!lines.length) return "";

  const title = opts.title || "Коммерческое предложение · purolat.com";
  const reference = draft.reference ? ` ${draft.reference}` : "";
  const rows = lines
    .map((line, idx) => {
      const name = String(
        line.requestedName || line.inquiryRaw || line.name || "—"
      ).replace(/\|/g, "/");
      const matched = String(line.name || "").replace(/\|/g, "/");
      const showName =
        matched && matched !== name && Number(line.unitPriceNet) > 0
          ? `${name} → ${matched}`
          : name;
      const qty = line.quantity ?? 1;
      const unit = line.unit || "шт";
      const hasPrice = Number(line.unitPriceNet) > 0;
      const unitPrice = hasPrice ? Number(line.unitPriceNet) : 0;
      const price = hasPrice ? unitPrice.toFixed(2) : "—";
      // Сумма = net × qty (КП без НДС); не брать lineTotal с VAT.
      const sum = hasPrice
        ? Number((unitPrice * Number(qty)).toFixed(2)).toFixed(2)
        : "—";
      const isAnalog = line.matchType === "analog" && hasPrice;
      let status;
      if (isAnalog) {
        status = `⚠ АНАЛОГ — вместо «${name}» предложен «${matched}»${line.analogOf ? ` (${line.analogOf})` : ""}`;
      } else if (hasPrice) {
        status = line.status || "В наличии";
      } else {
        status = "❌ Нет такого товара в каталоге — под заказ";
        if (line.similarSuggestion?.name) {
          status += `; похожий: «${String(line.similarSuggestion.name).replace(/\|/g, "/")}» — ${Number(line.similarSuggestion.price || 0).toFixed(2)} RUB (требует подтверждения)`;
        }
      }
      return `| ${idx + 1} | ${showName} | ${qty} | ${unit} | ${price} | ${sum} | ${status} |`;
    })
    .join("\n");

  const priced = lines.filter((l) => Number(l.unitPriceNet) > 0);
  const analogs = priced.filter((l) => l.matchType === "analog");
  const notFound = lines.filter((l) => !(Number(l.unitPriceNet) > 0));
  const subtotal = priced.reduce(
    (s, l) => s + Number(l.unitPriceNet) * Number(l.quantity ?? 1),
    0
  );

  const notesLines = [];
  if (analogs.length) {
    notesLines.push(
      `**Аналоги (${analogs.length}):** точного товара нет в каталоге, предложен аналог — см. колонку «Статус».`
    );
  }
  if (notFound.length) {
    notesLines.push(
      `**Нет в каталоге (${notFound.length}):** таких товаров нет в каталоге purolat.com — цена не указана («под заказ»).`
    );
  }
  const notesBlock = notesLines.length ? `\n${notesLines.join("  \n")}\n` : "";

  return `# ${title}${reference}

**Дата:** ${new Date().toLocaleDateString("ru-RU")}  
**Позиций:** ${lines.length} (с ценой ShopDB: ${priced.length}, аналогов: ${analogs.length}, нет в каталоге: ${notFound.length})
${notesBlock}

## Перечень позиций

| № | Наименование | Кол-во | Ед. | Цена, RUB | Сумма, RUB | Статус |
|---|--------------|-------|-----|-----------|------------|--------|
${rows}

## Итого

| Показатель | Значение |
|------------|----------|
| Всего позиций | ${lines.length} |
| С ценой ShopDB | ${priced.length} |
| Из них аналогов | ${analogs.length} |
| Нет в каталоге (под заказ) | ${lines.length - priced.length} |
| **Сумма (только ShopDB)** | **${subtotal.toFixed(2)} RUB** |

## Условия

- Цены только из каталога purolat.com (ShopDB). Без цены — «под заказ», не угадывать.
- Количество и наименования — из PDF-заявки.

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
};
