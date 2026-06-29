/**
 * Пилотные правила технических аналогов крепежа (DIN ↔ ГОСТ/ISO).
 * Размеры не меняем — только стандарт/покрытие/класс прочности.
 */

const { normalizeForMatch } = require("./hardwareQuery");

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
    analogs: ["7805", "4017"],
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
];

const STATUS = {
  IN_STOCK: "В наличии",
  ANALOG: "Аналог",
  ON_ORDER: "Под заказ",
  OUT_OF_STOCK: "Нет в наличии",
  NEEDS_REVIEW: "Требует проверки",
};

const GOST_STANDARD_RE = /(?:gost|гост)\s*[- ]?\s*(\d{4,5})/gi;
const DIN_STANDARD_RE = /\bdin\s*[- ]?\s*(\d{3,5})\b/gi;

function extractStandardNumbers(text) {
  const raw = String(text || "");
  const numbers = new Set();
  for (const m of raw.matchAll(DIN_STANDARD_RE)) {
    numbers.add(m[1]);
  }
  for (const m of raw.matchAll(GOST_STANDARD_RE)) {
    numbers.add(m[1]);
  }
  for (const m of raw.matchAll(/\biso\s*[- ]?\s*(\d{4})\b/gi)) {
    numbers.add(m[1]);
  }
  for (const m of raw.matchAll(/\b(\d{4,5})\s*[-–]\s*\d{2}\b/g)) {
    numbers.add(m[1]);
  }
  return [...numbers];
}

function extractThread(text) {
  const norm = normalizeForMatch(text);
  const m = norm.match(/\bm\s*(\d+)\s*x\s*(\d+)\b/i);
  if (!m) return null;
  return { size: m[1], length: m[2] };
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

function threadMatchesExact(nameNorm, thread) {
  if (!thread) return true;
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
  const rule = ANALOG_RULES.find((r) => r.din === n || r.analogs.includes(n));
  if (!rule) return [n];
  return [rule.din, ...rule.analogs];
}

function classifyProductMatch(requestText, product) {
  const nameNorm = normalizeForMatch(product.name || "");
  const requestedStandards = extractStandardNumbers(requestText);
  const thread = extractThread(requestText);
  const pin = extractPinDimensions(requestText);
  const stockCount = Number(product.stockCount ?? product.count ?? 0);

  if (/кг|kg|метр|meter|\bm\b|упак|pack|л\s|литр/i.test(requestText)) {
    return {
      matchType: "needs_review",
      status: STATUS.NEEDS_REVIEW,
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
      if (rule?.matchRule === "pin_dimensions" && pin) {
        if (!pinMatchesExact(nameNorm, pin)) continue;
      } else if (thread) {
        if (!threadMatchesExact(nameNorm, thread)) continue;
      }
      matchedExact = true;
      break;
    }

    for (const alt of equiv) {
      if (alt === std) continue;
      if (!nameContainsStandard(nameNorm, alt)) continue;

      if (rule?.matchRule === "pin_dimensions" && pin) {
        if (!pinMatchesExact(nameNorm, pin)) continue;
      } else if (thread) {
        if (!threadMatchesExact(nameNorm, thread)) continue;
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

  if (matchedExact) {
    return {
      matchType: "exact",
      status: stockCount > 0 ? STATUS.IN_STOCK : STATUS.ON_ORDER,
      analogOf: null,
    };
  }

  if (matchedAnalog) {
    return {
      matchType: "analog",
      status: stockCount > 0 ? STATUS.ANALOG : STATUS.ON_ORDER,
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
  extractPinDimensions,
  classifyProductMatch,
  applyAnalogScoringPenalty,
  applyMatchPriorityBonus,
  getEquivalentStandards,
  threadMatchesExact,
  pinMatchesExact,
};
