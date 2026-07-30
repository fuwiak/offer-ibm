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

function inferThreadCoverage(name, standards = []) {
  const raw = cleanValue(name).toLowerCase();
  if (/(?:^|\s)п\s*\/\s*р(?:\s|$)/iu.test(raw)) return "полная";
  if (/(?:^|\s)н\s*\/\s*р(?:\s|$)/iu.test(raw)) return "неполная";
  if (standards.some((value) => /\bDIN\s*933\b/i.test(value))) return "полная";
  if (standards.some((value) => /\bDIN\s*931\b/i.test(value)))
    return "неполная";
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
  if (/оцинк|zinc/.test(raw)) return "цинк";
  return raw;
}

function buildCanonicalProductFields(product = {}, features = []) {
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

  return {
    type,
    standards,
    diameter: diameterValue(diameterFeature, parsed),
    length,
    thread: inferThreadCoverage(name, standards),
    pitch: pitch ? normalizedNumber(pitch) : "",
    strength:
      cleanValue(featureValue(features, FEATURE_ALIASES.strength)) ||
      cleanValue(parsed.strengthClass),
    coating: normalizeCoating(parsed.coating),
    material: normalizeMaterial(
      featureValue(features, FEATURE_ALIASES.material)
    ),
    unit: cleanValue(
      featureValue(features, FEATURE_ALIASES.unit)
    ).toLowerCase(),
    packageQuantity: cleanValue(
      featureValue(features, FEATURE_ALIASES.packageQuantity)
    ),
    category: cleanValue(product.category_name || product.categoryName),
    name,
  };
}

function buildCanonicalProductText(product = {}, features = []) {
  const fields = buildCanonicalProductFields(product, features);
  const parts = [
    fields.type && `тип=${fields.type}`,
    fields.standards.length && `стандарт=${fields.standards.join(", ")}`,
    fields.diameter && `диаметр=${fields.diameter}`,
    fields.length && `длина=${fields.length}`,
    fields.thread && `резьба=${fields.thread}`,
    fields.pitch && `шаг=${fields.pitch}`,
    fields.strength && `прочность=${fields.strength}`,
    fields.coating && `покрытие=${fields.coating}`,
    fields.material && `материал=${fields.material}`,
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
  buildCanonicalProductFields,
  buildCanonicalProductText,
  canonicalTextHash,
  canonicalEmbeddingCacheKey,
  extractStandards,
  inferThreadCoverage,
};
