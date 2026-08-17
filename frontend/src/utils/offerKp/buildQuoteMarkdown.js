/**
 * Rebuild KP markdown from editable line items (matches server auto-quote layout).
 */
import { lineGrossTotal, lineUnitGross } from "./quoteLineTotals";

export function buildQuoteMarkdown({
  reference = "DRAFT",
  customer = {},
  lines = [],
  subtotal = 0,
  shipping = 0,
  total = 0,
  currency = "RUB",
}) {
  const rows = (Array.isArray(lines) ? lines : [])
    .filter((l) => l && typeof l === "object")
    .map((l, i) => {
      const name = l.name || l.productName || "";
      const qty = l.quantity || 1;
      const price = lineUnitGross(l);
      const sum = lineGrossTotal(l);
      return `| ${i + 1} | ${name} | ${l.article || l.sku || ""} | ${qty} | ${l.unit || "шт"} | ${price.toFixed(2)} ${currency} | ${sum.toFixed(2)} ${currency} | ${l.status || "Требует проверки"} | ${l.comment || ""} |`;
    })
    .join("\n");

  const safeCustomer =
    customer && typeof customer === "object" ? customer : {};
  const customerLine = [safeCustomer.name, safeCustomer.country]
    .filter(Boolean)
    .join(" · ");

  const computedSubtotal =
    Number(subtotal) ||
    Number(total) ||
    (Array.isArray(lines) ? lines : []).reduce(
      (sum, line) => sum + lineGrossTotal(line),
      0
    );
  const ship = Number(shipping) || 0;
  const grandTotal = computedSubtotal + ship;

  return `# Коммерческое предложение ${reference}

**Клиент:** ${customerLine || "—"}  
**Дата:** ${new Date().toLocaleDateString("ru-RU")}

## Позиции

| № | Наименование | Артикул | Кол-во | Ед. | Цена | Сумма | Статус | Комментарий |
|---|--------------|---------|--------|-----|------------|-------|--------|-------------|
${rows || "| — | — | — | — | — | — | — | — | — |"}

**Подытог:** ${computedSubtotal.toFixed(2)} ${currency}  
**Доставка:** ${ship.toFixed(2)} ${currency}  
**Итого:** ${grandTotal.toFixed(2)} ${currency}
`;
}
