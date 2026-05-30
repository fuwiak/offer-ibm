/** lawyer-revizorro product catalog and quote pricing rules (README v5). */

export const LAWYER_REVIZORRO_PRODUCTS = [
  { id: "one-8-3", name: "lawyer-revizorro One 8.3", basePricePerM2: 185 },
  { id: "diamond", name: "lawyer-revizorro Diamond", basePricePerM2: 220 },
  { id: "hybrid", name: "lawyer-revizorro Hybrid", basePricePerM2: 245 },
  { id: "laminated", name: "lawyer-revizorro Laminated", basePricePerM2: 265 },
  { id: "cs-6840", name: "lawyer-revizorro CS 6840", basePricePerM2: 195 },
];

export const MIN_SURFACE_M2 = 0.3;
export const SURCHARGE_2_5M = 1.3;
export const SURCHARGE_3M = 1.8;
export const LENGTH_THRESHOLD_2_5M = 2500;
export const LENGTH_THRESHOLD_3M = 3000;

/**
 * @param {{ lengthMm: number, heightMm: number, quantity: number }} line
 */
export function lineSurfaceM2({ lengthMm, heightMm, quantity }) {
  const raw = (lengthMm / 1000) * (heightMm / 1000) * quantity;
  const perUnit = (lengthMm / 1000) * (heightMm / 1000);
  const billedPerUnit = Math.max(perUnit, MIN_SURFACE_M2);
  return billedPerUnit * quantity;
}

/**
 * @param {number} lengthMm longest edge in mm
 */
export function lengthSurchargeMultiplier(lengthMm) {
  if (lengthMm > LENGTH_THRESHOLD_3M) return SURCHARGE_3M;
  if (lengthMm > LENGTH_THRESHOLD_2_5M) return SURCHARGE_2_5M;
  return 1;
}

/**
 * @param {Array<{ productId: string, lengthMm: number, heightMm: number, quantity: number }>} lines
 * @param {{ shipping?: number }} options
 */
export function calculateQuote(lines, options = {}) {
  const shipping = options.shipping ?? 0;
  const computedLines = lines.map((line) => {
    const product = LAWYER_REVIZORRO_PRODUCTS.find((p) => p.id === line.productId);
    const maxEdge = Math.max(line.lengthMm, line.heightMm);
    const surfaceM2 = lineSurfaceM2(line);
    const surcharge = lengthSurchargeMultiplier(maxEdge);
    const unitPrice = (product?.basePricePerM2 ?? 0) * surcharge;
    const lineTotal = surfaceM2 * unitPrice;
    return {
      ...line,
      productName: product?.name ?? line.productId,
      surfaceM2: Number(surfaceM2.toFixed(4)),
      surchargeMultiplier: surcharge,
      unitPricePerM2: unitPrice,
      lineTotal: Number(lineTotal.toFixed(2)),
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
  const prefix = options.prefix || "AV";
  const initials = options.initials || "";
  const suffix = initials ? `${initials}${seq}` : seq;
  return `${prefix}-${yyyymmdd}-${suffix}`;
}
