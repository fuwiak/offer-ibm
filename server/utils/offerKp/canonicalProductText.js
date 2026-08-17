"use strict";

const crypto = require("crypto");
const { parseHardwareQuery } = require("./hardwareQuery");

const FEATURE_ALIASES = {
  standard: ["din/гост/iso", "стандарт"],
  diameter: ["диаметр"],
  length: ["длина"],
  strength: ["кл. пр. / характеристика", "класс прочности"],
  material: ["материал"],
  unit: ["ед. изм.", "единица измерения"],
  packageQuantity: ["кол-во в упаковке", "количество в упаковке"],
};

/** Critical identity fields — must agree when both sides specify them. */
const CRITICAL_SIGNATURE_FIELDS = Object.freeze([
  "productType",
  "standardFamily",
  "diameter",
  "length",
  "fullOrPartialThread",
  "strengthClass",
]);

function cleanValue(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedFeatureName(name) {
  return cleanValue(name).toLowerCase();
}

function featureValue(features, aliases) {
  const accepted = new Set(aliases.map(normalizedFeatureName));
  const row = (features || []).find((item) =>
    accepted.has(normalizedFeatureName(item?.name || item?.feature_name))
  );
  if (!row) return "";
  const value = cleanValue(row.value ?? row.feature_value);
  const unit = cleanValue(row.unit);
  if (!value) return "";
  return unit ? `${value} ${unit}` : value;
}

function normalizedNumber(value) {
  const raw = cleanValue(value).replace(",", ".");
  const number = Number(raw);
  if (!Number.isFinite(number)) return raw;
  return Number.isInteger(number) ? String(number) : String(number);
}

function dimensionValue(value) {
  const match = cleanValue(value).match(
    /^(-?\d+(?:[.,]\d+)?)\s*([\p{L}²³]+)?$/u
  );
  if (!match) return cleanValue(value);
  const number = normalizedNumber(match[1]);
  if (Number(number) <= 0) return "";
  const unit = cleanValue(match[2] || "mm").toLowerCase();
  return `${number} ${unit}`;
}

function normalizeLengthMm(value) {
  const raw = cleanValue(value).toLowerCase().replace(",", ".");
  if (!raw) return "";
  const match = raw.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return raw;
  const number = normalizedNumber(match[1]);
  return Number(number) > 0 ? number : "";
}

function diameterValue(value, parsed = {}) {
  const raw = cleanValue(value);
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  const number = match?.[0] || parsed.diameter || parsed.thread?.size || "";
  const normalized = normalizedNumber(number);
  return normalized && Number(normalized) > 0 ? `M${normalized}` : "";
}

function extractStandards(name, featureStandard = "") {
  const values = [];
  const raw = cleanValue(name).replace(/[–—]/g, "-");
  const pattern =
    /(?:^|[^\p{L}\p{N}])(DIN|ГОСТ|GOST|ISO|ИСО)\s*([A-ZА-Я]?\s*\d+(?:\s*-\s*\d+)*(?:[A-ZА-Я])?)/giu;
  for (const match of raw.matchAll(pattern)) {
    const prefix =
      match[1].toUpperCase() === "GOST" ? "ГОСТ" : match[1].toUpperCase();
    const code = cleanValue(match[2]).replace(/\s*-\s*/g, "-");
    values.push(`${prefix} ${code}`);
  }
  if (!values.length && featureStandard) {
    const standard = cleanValue(featureStandard);
    values.push(/^\d/.test(standard) ? `DIN ${standard}` : standard);
  }
  return [...new Set(values)];
}

function standardFamilyNumber(value) {
  const m = String(value || "").match(/(\d{3,5})/);
  return m ? m[1] : "";
}

function pickStandardFamily(standards = []) {
  if (!standards.length) return "";
  const din = standards.find((value) => /^DIN\b/i.test(value));
  if (din) return din;
  const gost = standards.find((value) => /^ГОСТ\b/i.test(value));
  if (gost) return gost;
  return standards[0];
}

function inferThreadCoverage(name, standards = []) {
  const raw = cleanValue(name).toLowerCase();
  if (/(?:^|\s)п\s*\/\s*р(?:\s|$)/iu.test(raw)) return "полная";
  if (/(?:^|\s)н\s*\/\s*р(?:\s|$)/iu.test(raw)) return "неполная";
  if (standards.some((value) => /\bDIN\s*933\b/i.test(value))) return "полная";
  if (standards.some((value) => /\bDIN\s*931\b/i.test(value)))
    return "неполная";
  return "";
}

function inferHeadType(name) {
  const raw = cleanValue(name).toLowerCase();
  if (/потай|countersunk/i.test(raw)) return "потайная";
  if (/полукруг|button\s*head|round\s*head/i.test(raw)) return "полукруглая";
  if (/внутренн.*шестигран|imbus|hex\s*socket|din\s*912/i.test(raw))
    return "внутр. шестигран";
  if (/шестигран|hex\s*head|din\s*933|din\s*931/i.test(raw))
    return "шестигранная";
  return "";
}

function normalizeMaterial(value) {
  const raw = cleanValue(value);
  if (!raw) return "";
  return raw
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeCoating(value) {
  const raw = cleanValue(value).toLowerCase();
  if (!raw) return "";
  if (/оцинк|zinc|\bzn\b/.test(raw)) return "цинк";
  if (/нержав|stainless|\ba2\b|\ba4\b/.test(raw)) return "нержавейка";
  if (/без\s*покрыт|plain|чёрн|black\s*oxide/.test(raw)) return "без покрытия";
  return raw;
}

function emptySignature() {
  return {
    productType: "",
    standardFamily: "",
    standards: [],
    diameter: "",
    length: "",
    threadPitch: "",
    fullOrPartialThread: "",
    strengthClass: "",
    material: "",
    coating: "",
    headType: "",
  };
}

/**
 * Structured technical signature — used for hard constraints and
 * cheapest-SKU-within-signature. Embedding still uses canonical text.
 */
function toProductSignature(fields = {}) {
  const standards = Array.isArray(fields.standards) ? fields.standards : [];
  return {
    productType: cleanValue(fields.productType || fields.type).toLowerCase(),
    standardFamily:
      cleanValue(fields.standardFamily) || pickStandardFamily(standards),
    standards,
    diameter: cleanValue(fields.diameter),
    length: cleanValue(fields.length),
    threadPitch: cleanValue(fields.threadPitch || fields.pitch),
    fullOrPartialThread: cleanValue(
      fields.fullOrPartialThread || fields.thread
    ),
    strengthClass: cleanValue(fields.strengthClass || fields.strength),
    material: cleanValue(fields.material),
    coating: cleanValue(fields.coating),
    headType: cleanValue(fields.headType),
  };
}

function buildCanonicalProductFields(product = {}, features = []) {
  // Explicit null bypasses default `= {}` and crashed on `.name`.
  if (!product || typeof product !== "object") product = {};
  const name = cleanValue(product.name);
  const parsed = parseHardwareQuery(name);
  const featureStandard = featureValue(features, FEATURE_ALIASES.standard);
  const standards = extractStandards(name, featureStandard);
  const diameterFeature = featureValue(features, FEATURE_ALIASES.diameter);
  const lengthFeature = featureValue(features, FEATURE_ALIASES.length);
  const type =
    cleanValue(parsed.productTypes?.[0]) ||
    cleanValue(product.category_name || product.categoryName).toLowerCase();
  const length =
    dimensionValue(lengthFeature) ||
    (parsed.thread?.length
      ? `${normalizedNumber(parsed.thread.length)} mm`
      : "");
  const pitch =
    cleanValue(parsed.pitch?.value || parsed.pitch) ||
    cleanValue(name.match(/(?:шаг|pitch)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/iu)?.[1]);

  const fields = {
    type,
    productType: type,
    standards,
    standardFamily: pickStandardFamily(standards),
    diameter: diameterValue(diameterFeature, parsed),
    length,
    thread: inferThreadCoverage(name, standards),
    fullOrPartialThread: inferThreadCoverage(name, standards),
    pitch: pitch ? normalizedNumber(pitch) : "",
    threadPitch: pitch ? normalizedNumber(pitch) : "",
    strength:
      cleanValue(featureValue(features, FEATURE_ALIASES.strength)) ||
      cleanValue(parsed.strengthClass),
    strengthClass:
      cleanValue(featureValue(features, FEATURE_ALIASES.strength)) ||
      cleanValue(parsed.strengthClass),
    coating: normalizeCoating(parsed.coating),
    material: normalizeMaterial(
      featureValue(features, FEATURE_ALIASES.material)
    ),
    headType: inferHeadType(name),
    unit: cleanValue(
      featureValue(features, FEATURE_ALIASES.unit)
    ).toLowerCase(),
    packageQuantity: cleanValue(
      featureValue(features, FEATURE_ALIASES.packageQuantity)
    ),
    category: cleanValue(product.category_name || product.categoryName),
    name,
  };
  return fields;
}

function buildProductSignature(product = {}, features = []) {
  return toProductSignature(buildCanonicalProductFields(product, features));
}

/** Query-side signature from free text (RFQ line). */
function buildQuerySignature(queryText) {
  const text = cleanValue(queryText);
  if (!text) return emptySignature();
  const parsed = parseHardwareQuery(text);
  const standards = extractStandards(text);
  const diameter = parsed.thread?.size
    ? `M${normalizedNumber(parsed.thread.size)}`
    : parsed.diameter
      ? `M${normalizedNumber(parsed.diameter)}`
      : "";
  const length = parsed.thread?.length
    ? `${normalizedNumber(parsed.thread.length)} mm`
    : "";
  const pitch = cleanValue(parsed.pitch?.value || parsed.pitch);
  return toProductSignature({
    productType: cleanValue(parsed.productTypes?.[0]).toLowerCase(),
    standards,
    standardFamily: pickStandardFamily(standards),
    diameter,
    length,
    threadPitch: pitch ? normalizedNumber(pitch) : "",
    fullOrPartialThread: inferThreadCoverage(text, standards),
    strengthClass: cleanValue(parsed.strengthClass),
    coating: normalizeCoating(parsed.coating),
    headType: inferHeadType(text),
  });
}

function fieldConflict(queryValue, productValue, normalize = (v) => v) {
  const left = normalize(queryValue);
  const right = normalize(productValue);
  if (!left || !right) return false;
  return left !== right;
}

/**
 * Hard conflicts when BOTH sides specify a critical field and they disagree.
 * Soft attributes (coating/material/headType) are not hard rejects here.
 */
function signatureHardConflicts(querySig, productSig) {
  const query = toProductSignature(querySig || {});
  const product = toProductSignature(productSig || {});
  const hard = [];

  if (
    fieldConflict(query.productType, product.productType, (v) =>
      cleanValue(v).toLowerCase()
    )
  ) {
    // Allow category noise like "din 933" vs "болт" — only conflict when both
    // look like product-type roots (short Cyrillic/Latin type words).
    const qType = cleanValue(query.productType).toLowerCase();
    const pType = cleanValue(product.productType).toLowerCase();
    const typeLike = (t) =>
      /^(болт|винт|гайк|шайб|штифт|шпильк|гвозд|заклеп|bolt|screw|nut|washer|pin)/u.test(
        t
      );
    if (typeLike(qType) && typeLike(pType) && qType !== pType) {
      hard.push("productType");
    }
  }

  if (
    fieldConflict(query.diameter, product.diameter, (v) =>
      cleanValue(v).toUpperCase()
    )
  ) {
    hard.push("diameter");
  }

  if (fieldConflict(query.length, product.length, normalizeLengthMm)) {
    hard.push("length");
  }

  if (
    fieldConflict(query.fullOrPartialThread, product.fullOrPartialThread, (v) =>
      cleanValue(v).toLowerCase()
    )
  ) {
    hard.push("fullOrPartialThread");
  }

  if (
    fieldConflict(query.strengthClass, product.strengthClass, (v) =>
      cleanValue(v)
    )
  ) {
    hard.push("strengthClass");
  }

  if (
    fieldConflict(query.standardFamily, product.standardFamily, (v) =>
      cleanValue(v).toUpperCase()
    )
  ) {
    // ГОСТ Р 52644-2006 vs «ГОСТ 52644»: stripping non-digits used to yield
    // 526442006 ≠ 52644 and hard-rejected the live HV bolt/nut.
    const qNum = standardFamilyNumber(query.standardFamily);
    const pNum = standardFamilyNumber(product.standardFamily);
    if (qNum && pNum && qNum !== pNum) hard.push("standardFamily");
  }

  if (
    fieldConflict(query.threadPitch, product.threadPitch, (v) =>
      normalizedNumber(v)
    )
  ) {
    hard.push("threadPitch");
  }

  return hard;
}

/** Compact key for cheapest-within-signature clustering. */
function signatureIdentityKey(sig = {}) {
  const s = toProductSignature(sig);
  return [
    s.productType,
    s.standardFamily,
    s.diameter,
    normalizeLengthMm(s.length),
    s.fullOrPartialThread,
    s.strengthClass,
  ]
    .map((part) => cleanValue(part).toLowerCase())
    .join("|");
}

function signaturesMatchForPricing(a, b) {
  const left = signatureIdentityKey(a);
  const right = signatureIdentityKey(b);
  if (!left.replace(/\|/g, "") || !right.replace(/\|/g, "")) return false;
  return left === right;
}

function buildCanonicalProductText(product = {}, features = []) {
  const fields = buildCanonicalProductFields(product, features);
  const parts = [
    fields.productType && `тип=${fields.productType}`,
    fields.standards.length && `стандарт=${fields.standards.join(", ")}`,
    fields.diameter && `диаметр=${fields.diameter}`,
    fields.length && `длина=${fields.length}`,
    fields.fullOrPartialThread && `резьба=${fields.fullOrPartialThread}`,
    fields.threadPitch && `шаг=${fields.threadPitch}`,
    fields.strengthClass && `прочность=${fields.strengthClass}`,
    fields.coating && `покрытие=${fields.coating}`,
    fields.material && `материал=${fields.material}`,
    fields.headType && `головка=${fields.headType}`,
    fields.unit && `единица=${fields.unit}`,
    fields.packageQuantity && `в_упаковке=${fields.packageQuantity}`,
    fields.category && `категория=${fields.category}`,
    fields.name && `наименование=${fields.name}`,
  ].filter(Boolean);
  return parts.join(" | ");
}

function canonicalTextHash(text) {
  return crypto
    .createHash("sha256")
    .update(String(text || ""), "utf8")
    .digest("hex");
}

function canonicalEmbeddingCacheKey(modelId, productId, canonicalText) {
  return `${cleanValue(modelId)}:${productId}:${canonicalTextHash(canonicalText)}`;
}

module.exports = {
  FEATURE_ALIASES,
  CRITICAL_SIGNATURE_FIELDS,
  buildCanonicalProductFields,
  buildCanonicalProductText,
  buildProductSignature,
  buildQuerySignature,
  toProductSignature,
  signatureHardConflicts,
  standardFamilyNumber,
  signatureIdentityKey,
  signaturesMatchForPricing,
  canonicalTextHash,
  canonicalEmbeddingCacheKey,
  extractStandards,
  inferThreadCoverage,
  inferHeadType,
  normalizeLengthMm,
  emptySignature,
};
