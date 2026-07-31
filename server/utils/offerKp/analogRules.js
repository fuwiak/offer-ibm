/**
 * Пилотные правила технических аналогов крепежа (DIN ↔ ГОСТ/ISO).
 * Размеры не меняем — только стандарт/покрытие/класс прочности.
 */

const {
  normalizeForMatch,
  parseHardwareQuery,
  PRODUCT_TYPE_ROOTS,
} = require("./hardwareQuery");
const { extractMaterial } = require("./variantSpecs");

/** @type {Array<{din: string, analogs: string[], productType: string, matchRule: string}>} */
const ANALOG_RULES = [
  {
    din: "931",
    analogs: ["7798", "4014"],
    productType: "болт",
    matchRule: "thread_coating_strength",
    label: "DIN 931 → ГОСТ 7798-70, ISO 4014",
  },
  {
    din: "933",
    analogs: ["7798", "7805", "4017"],
    productType: "болт",
    matchRule: "thread_coating_strength",
    label: "DIN 933 → ГОСТ 7805-70, ISO 4017",
  },
  {
    din: "934",
    analogs: ["5915", "4032"],
    productType: "гайка",
    matchRule: "thread_pitch",
    label: "DIN 934 → ГОСТ 5915-70, ISO 4032",
  },
  {
    din: "439",
    analogs: ["5916"],
    productType: "гайка",
    matchRule: "thread_pitch",
    label: "DIN 439B → ГОСТ 5916-70",
  },
  {
    din: "6325",
    analogs: ["24296"],
    productType: "штифт",
    matchRule: "pin_dimensions",
    label: "DIN 6325 → ГОСТ 24296-93",
  },
  {
    din: "912",
    analogs: ["11738"],
    productType: "винт",
    matchRule: "thread_coating_strength",
    label: "DIN 912 → ГОСТ 11738",
  },
  {
    din: "433",
    analogs: ["10450"],
    productType: "шайба",
    matchRule: "diameter_coating",
    label: "DIN 433 → ГОСТ 10450-78",
  },
  {
    din: "125",
    analogs: ["11371"],
    productType: "шайба",
    matchRule: "diameter_coating",
    label: "DIN 125 → ГОСТ 11371-78",
  },
  {
    din: "7985",
    analogs: ["17473"],
    productType: "винт",
    matchRule: "thread_coating_strength",
    label: "DIN 7985 → ГОСТ 17473-80",
  },
  {
    din: "7978",
    analogs: ["9464"],
    productType: "штифт",
    matchRule: "pin_dimensions",
    label: "DIN 7978 → ГОСТ 9464-79",
  },
  {
    din: "1",
    analogs: ["3129"],
    productType: "штифт",
    matchRule: "pin_dimensions",
    label: "DIN 1 → ГОСТ 3129-70",
  },
];

const STATUS = {
  IN_STOCK: "В наличии",
  ANALOG: "Аналог",
  ON_ORDER: "Под заказ",
  OUT_OF_STOCK: "Нет в наличии",
  NEEDS_REVIEW: "Требует проверки",
};

const GOST_STANDARD_RE = /(?:gost|гост)\s*[- ]?\s*(\d{4,5})/gi;
// Letter suffix (DIN 6928C / DIN 980V) is part of the standard family — capture
// digits; optional trailing Latin/Cyrillic letter must not break the match.
const DIN_STANDARD_RE = /\bdin\s*[- ]?\s*(\d{1,5})(?:[a-zа-я])?(?![0-9])/gi;

function extractStandardNumbers(text) {
  const raw = String(text || "");
  const numbers = new Set();
  for (const m of raw.matchAll(DIN_STANDARD_RE)) {
    numbers.add(m[1]);
  }
  for (const m of raw.matchAll(GOST_STANDARD_RE)) {
    numbers.add(m[1]);
  }
  for (const m of raw.matchAll(
    /\biso\s*[- ]?\s*(\d{4})(?:[a-z])?(?![0-9])/gi
  )) {
    numbers.add(m[1]);
  }
  for (const m of raw.matchAll(/\b(\d{4,5})\s*[-–]\s*\d{2}\b/g)) {
    numbers.add(m[1]);
  }
  return [...numbers];
}

function extractThread(text) {
  return parseHardwareQuery(text).thread;
}

function extractDiameter(text) {
  const parsed = parseHardwareQuery(text);
  return parsed.diameter || parsed.thread?.size || null;
}

function extractPitch(text) {
  return parseHardwareQuery(text).pitch || null;
}

function diameterMatches(nameNorm, diameter) {
  if (!diameter) return true;
  const d = String(diameter).replace(".", "[.,]");
  // Do not require \b after digits: "m50x1.5" has no word-boundary between 50 and x.
  return new RegExp(
    `(?:\\bm\\s*${d}(?![0-9])|\\bd\\s*${d}(?![0-9]))`,
    "i"
  ).test(nameNorm);
}

function pitchMatches(nameNorm, diameter, pitch) {
  if (!pitch || !diameter) return true;
  const p = String(pitch).replace(".", "[.,]");
  return new RegExp(`\\bm\\s*${diameter}\\s*x\\s*${p}\\b`, "i").test(nameNorm);
}

function extractPinDimensions(text) {
  const norm = normalizeForMatch(text);
  const m =
    norm.match(/\b(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\b/i) &&
    !norm.match(/\bm\s*\d+\s*x\s*\d+/i)
      ? norm.match(/\b(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\b/i)
      : null;
  if (!m) return null;
  return {
    diameter: m[1].replace(",", "."),
    length: m[2].replace(",", "."),
  };
}

function nameContainsStandard(nameNorm, stdNum) {
  const n = String(stdNum);
  return (
    nameNorm.includes(`din ${n}`) ||
    nameNorm.includes(`din${n}`) ||
    nameNorm.includes(`gost ${n}`) ||
    nameNorm.includes(`gost${n}`) ||
    nameNorm.includes(`iso ${n}`) ||
    nameNorm.includes(`iso${n}`) ||
    new RegExp(`\\b${n}\\s*[-–]\\s*\\d{2}\\b`).test(nameNorm) ||
    new RegExp(`\\b${n}\\b`).test(nameNorm)
  );
}

/** ISO 261 coarse pitch — a query naming it adds no constraint the catalog omits. */
const COARSE_PITCH_MM = Object.freeze({
  3: 0.5,
  4: 0.7,
  5: 0.8,
  6: 1,
  8: 1.25,
  10: 1.5,
  12: 1.75,
  14: 2,
  16: 2,
  18: 2.5,
  20: 2.5,
  22: 2.5,
  24: 3,
  27: 3,
  30: 3.5,
  33: 3.5,
  36: 4,
  39: 4,
  42: 4.5,
  45: 4.5,
  48: 5,
  52: 5,
  56: 5.5,
  60: 5.5,
  64: 6,
});

/**
 * @returns {boolean} true when `pitch` is the standard coarse pitch for the
 *   diameter (or unknown diameter — then nothing can be claimed).
 */
function isCoarsePitch(diameter, pitch) {
  const coarse = COARSE_PITCH_MM[Number(diameter)];
  if (!coarse || !pitch) return true;
  return Math.abs(Number(String(pitch).replace(",", ".")) - coarse) < 0.01;
}

function threadMatchesExact(nameNorm, thread) {
  if (!thread) return true;
  // Fine thread is part of the identity: M16x1,5x150 must not match M16x150,
  // and a coarse M16x150 request must not match the fine-pitch product.
  if (thread.pitch) {
    const p = String(thread.pitch).replace(".", "[.,]");
    return new RegExp(
      `\\bm\\s*${thread.size}\\s*x\\s*${p}\\s*x\\s*${thread.length}\\b`,
      "i"
    ).test(nameNorm);
  }
  const re = new RegExp(
    `\\bm\\s*${thread.size}\\s*x\\s*${thread.length}\\b`,
    "i"
  );
  return re.test(nameNorm);
}

function pinMatchesExact(nameNorm, pin) {
  if (!pin) return true;
  const d = pin.diameter.replace(".", "[.,]");
  const l = pin.length.replace(".", "[.,]");
  const re = new RegExp(`\\b${d}\\s*x\\s*${l}\\b`, "i");
  return re.test(nameNorm);
}

// When the inquiry line itself carries no parseable thread/pin dimension
// (common when OCR drops "M10x100"), threadMatchesExact()/pinMatchesExact()
// return true unconditionally — there is nothing to compare against. That
// must NOT be read as "size confirmed": if the candidate product's own name
// does carry a specific size, we simply can't tell whether it's the right
// one, so it has to be flagged for review rather than accepted as exact.
// Washers/nuts with diameter-only in the query are OK when diameter matches.
function productNameHasUnverifiableDimension(
  nameNorm,
  rule,
  queryParsed = null
) {
  if (rule?.matchRule === "pin_dimensions") {
    return Boolean(extractPinDimensions(nameNorm));
  }
  if (rule?.matchRule === "diameter_coating") {
    // Query has diameter → verifiable; product M-size without query diameter → unverifiable.
    if (queryParsed?.diameter) return false;
    return Boolean(extractDiameter(nameNorm));
  }
  // Bolts/screws require MxL. A diameter-only request ("M10") cannot prove
  // that a concrete catalog item ("M10x80") is the requested length. Treat
  // it as unconfirmed rather than exact; otherwise an arbitrary in-stock
  // length can receive a ShopDB price and look like a grounded answer.
  if (queryParsed?.thread) return false;
  if (queryParsed?.diameter) return Boolean(extractThread(nameNorm));
  return Boolean(extractThread(nameNorm));
}

function productTypeMatches(nameNorm, requestedTypes = [], rule = null) {
  const types = requestedTypes.length
    ? requestedTypes
    : rule?.productType
      ? [rule.productType]
      : [];
  if (!types.length) return true;
  return types.some((type) =>
    (PRODUCT_TYPE_ROOTS[type] || [type]).some((root) =>
      nameNorm.includes(normalizeForMatch(root))
    )
  );
}

function strengthRank(value) {
  const match = String(value || "").match(/\b(\d+)(?:[.,](\d+))?\b/);
  if (!match) return null;
  return Number(match[1]) * 100 + Number(match[2] || 0);
}

function requestedSpecsMatch(
  nameNorm,
  parsed,
  rule = null,
  requestText = "",
  options = {}
) {
  if (!productTypeMatches(nameNorm, parsed.productTypes || [], rule)) {
    return { ok: false, reason: "product_type" };
  }
  // Material is an identity field, not a nicety: нерж A4 is not нерж A2 and
  // латунь is not steel, and the price gap runs several times over.
  // Always extract from raw catalog name — normalizeForMatch() folds Cyrillic
  // homoglyphs (нерж→nepж, медь→meдь) and extractMaterial then misses.
  const requestedMaterial = extractMaterial(requestText);
  if (requestedMaterial) {
    const candidateMaterial = extractMaterial(
      options.productName || options.rawName || ""
    );
    if (candidateMaterial !== requestedMaterial) {
      return { ok: false, reason: "material" };
    }
  }
  if (parsed.coating && !/оцинк|цинк|ocink|cink|\bzn\b|zinc/i.test(nameNorm)) {
    return { ok: false, reason: "coating" };
  }
  if (
    parsed.strengthClass &&
    !new RegExp(`\\b${parsed.strengthClass.replace(".", "\\.")}\\b`).test(
      nameNorm
    )
  ) {
    const requestedRank = strengthRank(parsed.strengthClass);
    const candidateRank = strengthRank(
      nameNorm.match(/(?:класс|class|кл\.?\s*пр\.?)?\s*(\d{1,2}[.,]\d)\b/i)?.[1]
    );
    if (
      !options.allowBetterStrength ||
      requestedRank == null ||
      candidateRank == null ||
      candidateRank < requestedRank
    ) {
      return { ok: false, reason: "strength_class" };
    }
  }
  return { ok: true, reason: null };
}

function findRuleForStandard(stdNum) {
  const n = String(stdNum);
  const asDin = ANALOG_RULES.find((r) => r.din === n);
  if (asDin) return { rule: asDin, role: "requested" };
  for (const rule of ANALOG_RULES) {
    if (rule.analogs.includes(n)) return { rule, role: "analog" };
  }
  return null;
}

function getEquivalentStandards(stdNum) {
  const n = String(stdNum);
  const matching = ANALOG_RULES.filter(
    (rule) => rule.din === n || rule.analogs.includes(n)
  );
  if (!matching.length) return [n];
  return [...new Set(matching.flatMap((rule) => [rule.din, ...rule.analogs]))];
}

/**
 * Пользователь явно или по смыслу просит аналоги / zamienniki / similar.
 * «какие аналоги», «подбери аналог», «zamiennik», «equivalent»…
 * Важно: не использовать \\b для кириллицы — в JS \\b только ASCII.
 */
function detectAnalogIntent(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/аналог/i.test(t)) return true;
  if (/zamiennik|ekwiwalent|podobn/i.test(t)) return true;
  if (/\banalog(ue|s|ous)?\b|\bequivalent\w*\b|\balternative\w*\b/i.test(t))
    return true;
  if (/вместо\s+(этого|него|нее)|замен[аие]|не\s+точн\w*\s+совпад/i.test(t))
    return true;
  if (/нет\s+в\s+наличии.{0,40}(подбер|найд|аналог)/i.test(t)) return true;
  return false;
}

/** DIN/ГОСТ/ISO из запроса → все номера из пилотных пар (для SQL LIKE). */
function expandDinNumbersWithEquivalents(dinNumbers = []) {
  const out = new Set();
  for (const n of dinNumbers || []) {
    for (const eq of getEquivalentStandards(n)) out.add(String(eq));
  }
  return [...out];
}

/**
 * Size/dimension gate for a candidate name against the parsed inquiry.
 * @returns {{ ok: boolean, unconfirmed?: boolean }}
 */
function sizeSpecsOk(nameNorm, parsed, rule, pin) {
  const thread = parsed.thread;
  if (rule?.matchRule === "pin_dimensions") {
    if (pin) {
      return { ok: pinMatchesExact(nameNorm, pin) };
    }
    if (productNameHasUnverifiableDimension(nameNorm, rule, parsed)) {
      return { ok: false, unconfirmed: true };
    }
    return { ok: true };
  }

  if (thread) {
    return { ok: threadMatchesExact(nameNorm, thread) };
  }

  if (parsed.diameter) {
    if (!diameterMatches(nameNorm, parsed.diameter)) return { ok: false };
    if (
      rule?.matchRule === "thread_coating_strength" &&
      !parsed.thread &&
      extractThread(nameNorm)
    ) {
      return { ok: false, unconfirmed: true };
    }
    if (
      parsed.pitch &&
      !pitchMatches(nameNorm, parsed.diameter, parsed.pitch)
    ) {
      const nameHasPitch = /\bm\s*\d+\s*x\s*\d+(?:[.,]\d+)?\b/i.test(nameNorm);
      if (nameHasPitch) return { ok: false };
      // Catalog omits the pitch. Coarse pitch is the default, so that stays
      // exact; a fine pitch (M36x2) is a different product and the silent
      // candidate cannot prove it — abstain instead of pricing the coarse one.
      if (!isCoarsePitch(parsed.diameter, parsed.pitch)) {
        return { ok: false, unconfirmed: true };
      }
    }
    return { ok: true };
  }

  if (productNameHasUnverifiableDimension(nameNorm, rule, parsed)) {
    return { ok: false, unconfirmed: true };
  }
  return { ok: true };
}

/**
 * ShopDB exact identity (SKU or literal catalog title) is authoritative even
 * when the inquiry has no DIN/GOST text (SKU-only paste) or when enrichment
 * hard-constraints disagree. Without this, classifyProductMatch demotes those
 * hits to "similar" → draft shows weight/heuristic only, never price.
 */
function productHasExactSkuHit(product) {
  if (!product || typeof product !== "object") return false;
  if (product._exactSku || product._catalogNameExact) return true;
  const matchSource = String(product.matchSource || product.match_source || "");
  if (
    matchSource === "exact_sku" ||
    matchSource === "golden_override" ||
    matchSource === "catalog_name_exact"
  ) {
    return true;
  }
  const sources = product.shopMatchSources || product._matchSources || [];
  if (sources instanceof Set) {
    return (
      sources.has("exact_sku") ||
      sources.has("golden_override") ||
      sources.has("catalog_name_exact")
    );
  }
  return (
    Array.isArray(sources) &&
    (sources.includes("exact_sku") ||
      sources.includes("golden_override") ||
      sources.includes("catalog_name_exact"))
  );
}

function classifyProductMatch(requestText, product) {
  // Default `product = {}` does not catch explicit null — guard here.
  if (!product || typeof product !== "object") {
    return { matchType: "none", status: STATUS.OUT_OF_STOCK, analogOf: null };
  }
  const nameNorm = normalizeForMatch(product.name || "");
  const parsed = parseHardwareQuery(requestText);
  const requestedStandards = extractStandardNumbers(requestText);
  const thread = parsed.thread;
  const pin = extractPinDimensions(requestText);
  const stockCount = Number(product.stockCount ?? product.count ?? 0);
  // кг/упак — коммерческий флаг, НЕ отменяет точный подбор DIN/M×L
  // (раньше early-return → все строки брали самый дешёвый SKU ~18.5).
  const nonPieceUnit =
    /(?:^|[^\w])(?:кг|kg|упак|pack)(?:$|[^\w])/i.test(requestText) ||
    /метр|meter|литр/i.test(requestText);

  // Exact article hit owns identity + price — do not require DIN in the query.
  if (productHasExactSkuHit(product)) {
    return {
      matchType: "exact",
      status: nonPieceUnit
        ? STATUS.NEEDS_REVIEW
        : stockCount > 0
          ? STATUS.IN_STOCK
          : STATUS.ON_ORDER,
      analogOf: null,
    };
  }

  if (!requestedStandards.length) {
    if (stockCount > 0) {
      return {
        matchType: "similar",
        status: STATUS.NEEDS_REVIEW,
        analogOf: null,
      };
    }
    return { matchType: "none", status: STATUS.OUT_OF_STOCK, analogOf: null };
  }

  let matchedExact = false;
  let matchedAnalog = false;
  let analogLabel = null;

  for (const std of requestedStandards) {
    const equiv = getEquivalentStandards(std);
    const ruleInfo = findRuleForStandard(std);
    const rule = ruleInfo?.rule;

    if (nameContainsStandard(nameNorm, std)) {
      const size = sizeSpecsOk(nameNorm, parsed, rule, pin);
      if (size.unconfirmed) {
        return {
          matchType: "size_unconfirmed",
          status: STATUS.NEEDS_REVIEW,
          analogOf: null,
          mismatchReason: "size_unconfirmed",
        };
      }
      if (!size.ok) continue;
      const specs = requestedSpecsMatch(nameNorm, parsed, rule, requestText, {
        productName: product.name || "",
      });
      if (!specs.ok) {
        return {
          matchType: "spec_mismatch",
          status: STATUS.NEEDS_REVIEW,
          analogOf: null,
          mismatchReason: specs.reason,
        };
      }
      matchedExact = true;
      break;
    }

    for (const alt of equiv) {
      if (alt === std) continue;
      if (!nameContainsStandard(nameNorm, alt)) continue;

      const size = sizeSpecsOk(nameNorm, parsed, rule, pin);
      if (size.unconfirmed) {
        return {
          matchType: "size_unconfirmed",
          status: STATUS.NEEDS_REVIEW,
          analogOf: null,
          mismatchReason: "size_unconfirmed",
        };
      }
      if (!size.ok) continue;

      const specs = requestedSpecsMatch(nameNorm, parsed, rule, requestText, {
        allowBetterStrength: true,
        productName: product.name || "",
      });
      if (!specs.ok) {
        return {
          matchType: "spec_mismatch",
          status: STATUS.NEEDS_REVIEW,
          analogOf: null,
          mismatchReason: specs.reason,
        };
      }

      matchedAnalog = true;
      analogLabel = rule?.label || `Аналог ${std} → ${alt}`;
      break;
    }
    if (matchedAnalog) break;
  }

  if (thread && !threadMatchesExact(nameNorm, thread)) {
    const partialThread =
      nameNorm.includes(`m ${thread.size}`) ||
      nameNorm.includes(`m${thread.size}`);
    if (partialThread) {
      return {
        matchType: "size_mismatch",
        status: STATUS.ON_ORDER,
        analogOf: null,
      };
    }
  }

  if (
    !thread &&
    parsed.diameter &&
    !diameterMatches(nameNorm, parsed.diameter) &&
    (nameNorm.includes(`m `) ||
      /\bm\d/.test(nameNorm) ||
      /\bd\s*\d/.test(nameNorm))
  ) {
    return {
      matchType: "size_mismatch",
      status: STATUS.ON_ORDER,
      analogOf: null,
    };
  }

  if (matchedExact) {
    return {
      matchType: "exact",
      status: nonPieceUnit
        ? STATUS.NEEDS_REVIEW
        : stockCount > 0
          ? STATUS.IN_STOCK
          : STATUS.ON_ORDER,
      analogOf: null,
    };
  }

  if (matchedAnalog) {
    return {
      matchType: "analog",
      status: nonPieceUnit
        ? STATUS.NEEDS_REVIEW
        : stockCount > 0
          ? STATUS.ANALOG
          : STATUS.ON_ORDER,
      analogOf: analogLabel,
    };
  }

  return { matchType: "none", status: STATUS.OUT_OF_STOCK, analogOf: null };
}

function applyAnalogScoringPenalty(parsed, product, score) {
  const nameNorm = normalizeForMatch(product.name || "");
  if (parsed.thread && !threadMatchesExact(nameNorm, parsed.thread)) {
    if (nameNorm.includes(`m ${parsed.thread.size}`)) {
      return score - 200;
    }
    return score - 80;
  }
  return score;
}

function standardsInQuery(parsed, searchText) {
  const fromParsed = parsed?.dinNumbers || [];
  const fromText = extractStandardNumbers(searchText || "");
  return [...new Set([...fromParsed, ...fromText].map(String))];
}

/**
 * Бонусы/штрафы по OFFER_KP_MATCH_PRIORITIES (config/offerKp.harnessGuidelines.js).
 */
function applyMatchPriorityBonus(searchText, parsed, product, score) {
  const {
    OFFER_KP_MATCH_PRIORITIES,
  } = require("../../config/offerKp.harnessGuidelines");
  const nameNorm = normalizeForMatch(product.name || "");
  const requested = standardsInQuery(parsed, searchText);
  let next = score;

  for (const rule of OFFER_KP_MATCH_PRIORITIES) {
    const hit = rule.requestStandards.some((std) =>
      requested.some(
        (r) => r === std || getEquivalentStandards(r).includes(std)
      )
    );
    if (!hit) continue;

    for (const prefer of rule.prefer || []) {
      if (nameContainsStandard(nameNorm, prefer)) next += 30;
    }
    for (const deprioritize of rule.deprioritize || []) {
      if (nameContainsStandard(nameNorm, deprioritize)) next -= 25;
    }
    if (rule.defaultVariant && rule.prefer?.includes("912")) {
      if (/\bн\s*\/\s*р\b|н\/р|normal/i.test(nameNorm)) next += 10;
      if (/\bп\s*\/\s*р\b|п\/р|partial/i.test(nameNorm)) next -= 5;
    }
  }

  return next;
}

module.exports = {
  ANALOG_RULES,
  STATUS,
  extractStandardNumbers,
  extractThread,
  extractDiameter,
  extractPitch,
  extractPinDimensions,
  productNameHasUnverifiableDimension,
  productHasExactSkuHit,
  classifyProductMatch,
  applyAnalogScoringPenalty,
  applyMatchPriorityBonus,
  getEquivalentStandards,
  detectAnalogIntent,
  expandDinNumbersWithEquivalents,
  threadMatchesExact,
  pinMatchesExact,
  diameterMatches,
  pitchMatches,
  requestedSpecsMatch,
};
