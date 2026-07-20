/**
 * Rebuild KP markdown from editable line items (matches server auto-quote layout).
 */
export function buildQuoteMarkdown({
  reference = "DRAFT",
  customer = {},
  lines = [],
  subtotal = 0,
  shipping = 0,
  total = 0,
  currency = "RUB",
  vatRate = 0.2,
}) {
  const vatPct = Math.round(vatRate * 100);
  const taxableNet = Number(total) + Number(shipping);
  const vatAmount = Number((taxableNet * vatRate).toFixed(2));
  const rows = lines
    .map((l, i) => {
      const name = l.name || l.productName || "";
      const qty = l.quantity || 1;
      const netUnit = Number(
        l.unitPriceNet ??
          l.unitPrice ??
          (qty > 0 ? (Number(l.lineTotal) || 0) / qty : 0)
      );
      const price = Number(l.priceWithVat ?? netUnit * (1 + vatRate));
      const netSum = Number(l.lineTotal ?? qty * netUnit);
      const sum = Number((netSum * (1 + vatRate)).toFixed(2));
      return `| ${i + 1} | ${name} | ${l.article || l.sku || ""} | ${qty} | ${l.unit || "шт"} | ${price.toFixed(2)} ${currency} | ${sum.toFixed(2)} ${currency} | ${l.status || "Требует проверки"} | ${l.comment || ""} |`;
    })
    .join("\n");

  const customerLine = [customer.name, customer.country]
    .filter(Boolean)
    .join(" · ");

  return `# Коммерческое предложение ${reference}

**Клиент:** ${customerLine || "—"}  
**Дата:** ${new Date().toLocaleDateString("ru-RU")}

## Позиции

| № | Наименование | Артикул | Кол-во | Ед. | Цена с НДС | Сумма | Статус | Комментарий |
|---|--------------|---------|--------|-----|------------|-------|--------|-------------|
${rows || "| — | — | — | — | — | — | — | — | — |"}

**Подытог:** ${Number(subtotal).toFixed(2)} ${currency}  
**Доставка:** ${Number(shipping).toFixed(2)} ${currency}  
**НДС ${vatPct}%:** ${vatAmount.toFixed(2)} ${currency}  
**Итого с НДС:** ${(taxableNet + vatAmount).toFixed(2)} ${currency}
`;
}
