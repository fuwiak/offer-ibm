/**
 * Resolve a public purolat.com product page URL from a draft line.
 * Prefer ShopDB-backed `productUrl` / `url` already attached by matching.
 * Never invent `/product/{sku}` — that pattern is fabricated by LLMs.
 *
 * @param {object} line
 * @returns {string} absolute http(s) URL or ""
 */
export function resolveProductUrl(line = {}) {
  const raw = String(line.productUrl || line.url || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) return "";
  if (/\/product\//i.test(raw)) return "";
  if (/purolat\.com\/product(?:\/|\?|#|$)/i.test(raw)) return "";
  return raw;
}

export default resolveProductUrl;
