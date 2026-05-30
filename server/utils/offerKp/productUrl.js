/**
 * Публичные URL карточек товаров purolat.com (Webasyst Shop-Script).
 * В MySQL category.full_url = "stangi-spilyki/din-975" без префикса витрины.
 */

function getShopBaseUrl() {
  const fromEnv = (process.env.SHOP_BASE_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "https://purolat.com";
}

/** Префикс маршрута витрины, по умолчанию "shop" → /shop/... */
function getShopUrlPrefix() {
  const raw = (process.env.SHOP_URL_PREFIX ?? "shop").trim();
  if (!raw || raw === "0" || raw.toLowerCase() === "false") return "";
  return raw.replace(/^\/+|\/+$/g, "");
}

function normalizePathSegment(value) {
  return String(value || "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");
}

function buildPathSegments(prefix, categoryFullUrl, productUrl) {
  const cat = normalizePathSegment(categoryFullUrl);
  const slug = normalizePathSegment(productUrl);
  const segments = [];

  if (cat) {
    if (prefix && (cat === prefix || cat.startsWith(`${prefix}/`))) {
      segments.push(...cat.split("/").filter(Boolean));
    } else {
      if (prefix) segments.push(prefix);
      segments.push(...cat.split("/").filter(Boolean));
    }
  } else if (prefix) {
    segments.push(prefix);
  }

  if (slug) segments.push(slug);
  return segments;
}

/**
 * @param {string} baseUrl — https://purolat.com
 * @param {string} categoryFullUrl — stangi-spilyki/din-975
 * @param {string} productUrl — shtanga_din_975_m36x2000_zn
 */
function buildProductUrl(baseUrl, categoryFullUrl, productUrl) {
  const base = String(baseUrl || getShopBaseUrl()).replace(/\/+$/, "");
  const prefix = getShopUrlPrefix();
  const segments = buildPathSegments(prefix, categoryFullUrl, productUrl);
  if (!segments.length) return base;
  return `${base}/${segments.join("/")}/`;
}

module.exports = {
  getShopBaseUrl,
  getShopUrlPrefix,
  buildProductUrl,
};
