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
      const status = `${line.status || "—"}${productRef}`;
      return `| ${idx + 1} | ${requested} | ${matched} | ${qty} ${unit} | ${price} | ${status} |`;
    })
    .join("\n");

  return `${INQUIRY_DRAFT_HEADER}
Строк в заявке: ${lines.length}. В итоговом КП должно быть ровно ${lines.length} позиций — по одной на каждую строку ниже.
Количество — только из колонки «Кол-во» PDF (кг/шт).
Цена — ТОЛЬКО из колонки «Цена» этой таблицы (ShopDB / matchInquiryToDraft). Запрещено брать цены из PDF, OCR и «придумывать».
Если в черновике «— (нет в ShopDB)» — не указывай цену в КП, пиши «под заказ» / «требует проверки».

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

module.exports = {
  INQUIRY_DRAFT_HEADER,
  INQUIRY_DRAFT_FOOTER,
  isInquiryPdfCatalogBlock,
  limitCatalogBlocksForAgent,
  formatInquiryDraftSection,
  mergeInquiryDraftIntoUserPrompt,
};
