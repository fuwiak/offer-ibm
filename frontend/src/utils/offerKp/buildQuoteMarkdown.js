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
  const vatAmount = Number((total * vatRate).toFixed(2));
  const rows = lines
    .map((l, i) => {
      const name = l.name || l.productName || "";
      const qty = l.quantity || 1;
      const price = Number(l.priceWithVat ?? l.unitPrice ?? 0);
      const sum = Number(l.lineTotal ?? qty * price);
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
**Итого с НДС:** ${(Number(total) + vatAmount).toFixed(2)} ${currency}
`;
}
