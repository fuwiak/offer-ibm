/**
 * Каталог purolat.com — цены уже с НДС.
 * Суммы в КП считаются в gross, без повторного начисления НДС.
 */

export function lineUnitGross(line = {}) {
  if (line.priceWithVat != null && Number.isFinite(Number(line.priceWithVat))) {
    return Number(line.priceWithVat);
  }
  if (line.unitPrice != null && Number.isFinite(Number(line.unitPrice))) {
    return Number(line.unitPrice);
  }
  if (line.unitPriceNet != null && Number.isFinite(Number(line.unitPriceNet))) {
    return Number(line.unitPriceNet);
  }
  const qty = Number(line.quantity) || 0;
  const total = Number(line.lineTotal) || 0;
  return qty > 0 ? total / qty : 0;
}

export function lineGrossTotal(line = {}) {
  const qty = Number(line.quantity) || 0;
  const unit = lineUnitGross(line);
  if (unit > 0 && qty > 0) {
    return Number((unit * qty).toFixed(2));
  }
  if (line.lineTotal != null && Number.isFinite(Number(line.lineTotal))) {
    return Number(line.lineTotal);
  }
  return 0;
}

/** Справочно: цена без НДС (не используется в итогах). */
export function lineUnitNetReference(line = {}, vatRate = 0.2) {
  const gross = lineUnitGross(line);
  if (!gross) return 0;
  return Number((gross / (1 + vatRate)).toFixed(2));
}

export function recalcLineGross(line, vatRate = 0.2, { preserveLineTotal = false } = {}) {
  const qty = Number(line.quantity) || 0;
  const priceWithVat = lineUnitGross(line);
  const next = {
    ...line,
    quantity: qty,
    priceWithVat,
    unitPriceNet: lineUnitNetReference({ ...line, priceWithVat }, vatRate),
  };
  if (!preserveLineTotal) {
    next.lineTotal = Number((qty * priceWithVat).toFixed(2));
  }
  return next;
}
