/** Каталог позиций для оферт purolat.com (упрощённые цены за шт.). */

const OFFER_KP_PRODUCTS = [
  { id: "din-975", name: "Threaded rod DIN 975", nameRu: "Штанга DIN 975", basePricePerUnit: 120 },
  { id: "din-931", name: "Bolt DIN 931", nameRu: "Болт DIN 931", basePricePerUnit: 8.5 },
  { id: "din-934", name: "Nut DIN 934", nameRu: "Гайка DIN 934", basePricePerUnit: 2.2 },
  { id: "din-912", name: "Socket screw DIN 912", nameRu: "Винт DIN 912", basePricePerUnit: 15 },
  {
    id: "gost-8787",
    name: "Key steel GOST 8787-68",
    nameRu: "Сталь шпоночная ГОСТ 8787-68",
    basePricePerUnit: 95,
  },
];

/**
 * @param {Array<{ productId: string, lengthMm: number, heightMm: number, quantity: number }>} lines
 * lengthMm = diameter (mm), heightMm = length (mm)
 */
function calculateQuote(lines, options = {}) {
  const shipping = options.shipping ?? 0;
  const computedLines = lines.map((line) => {
    const product = OFFER_KP_PRODUCTS.find((p) => p.id === line.productId);
    const qty = line.quantity || 1;
    const unitPrice = product?.basePricePerUnit ?? 0;
    const lineTotal = unitPrice * qty;
    return {
      ...line,
      productName: product?.name ?? line.productId,
      productNameRu: product?.nameRu ?? product?.name ?? line.productId,
      unitPrice,
      lineTotal: Number(lineTotal.toFixed(2)),
      spec: `${line.lengthMm}x${line.heightMm} mm`,
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

function generateQuoteReference(options = {}) {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Math.floor(1 + Math.random() * 99)).padStart(2, "0");
  const prefix = options.prefix || "PUR";
  const initials = options.initials || "";
  const suffix = initials ? `${initials}${seq}` : seq;
  return `${prefix}-${yyyymmdd}-${suffix}`;
}

module.exports = {
  OFFER_KP_PRODUCTS,
  calculateQuote,
  generateQuoteReference,
};
