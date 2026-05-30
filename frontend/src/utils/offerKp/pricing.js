/** Каталог позиций для конструктора оферты purolat.com (упрощённые цены за шт.). */

export const OFFER_KP_PRODUCTS = [
  { id: "din-975", name: "Штанга DIN 975", basePricePerUnit: 120 },
  { id: "din-931", name: "Болт DIN 931", basePricePerUnit: 8.5 },
  { id: "din-934", name: "Гайка DIN 934", basePricePerUnit: 2.2 },
  { id: "din-912", name: "Винт DIN 912", basePricePerUnit: 15 },
  { id: "gost-8787", name: "Сталь шпоночная ГОСТ 8787-68", basePricePerUnit: 95 },
];

/**
 * @param {{ productId: string, lengthMm: number, heightMm: number, quantity: number }} line
 * lengthMm = диаметр (мм), heightMm = длина (мм)
 */
export function calculateQuote(lines, options = {}) {
  const shipping = options.shipping ?? 0;
  const computedLines = lines.map((line) => {
    const product = OFFER_KP_PRODUCTS.find((p) => p.id === line.productId);
    const qty = line.quantity || 1;
    const unitPrice = product?.basePricePerUnit ?? 0;
    const lineTotal = unitPrice * qty;
    return {
      ...line,
      productName: product?.name ?? line.productId,
      unitPrice,
      lineTotal: Number(lineTotal.toFixed(2)),
      spec: `${line.lengthMm}×${line.heightMm} mm`,
    };
  });

  const subtotal = computedLines.reduce((sum, l) => sum + l.lineTotal, 0);
  const total = subtotal + shipping;

  return {
    lines: computedLines,
    subtotal: Number(subtotal.toFixed(2)),
    shipping: Number(shipping.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

export function generateQuoteReference(options = {}) {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Math.floor(1 + Math.random() * 99)).padStart(2, "0");
  const prefix = options.prefix || "PUR";
  const initials = options.initials || "";
  const suffix = initials ? `${initials}${seq}` : seq;
  return `${prefix}-${yyyymmdd}-${suffix}`;
}
