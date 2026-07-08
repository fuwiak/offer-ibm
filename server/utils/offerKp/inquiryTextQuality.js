"use strict";

const { foldHomoglyphs } = require("./textNormalize");

const HEADER_MARKERS = [
  "ответственный",
  "наименование",
  "потребность",
  "исполнитель",
  "приложение",
  "рассказова",
  "полугодие",
];

const GARBLED_HEADER_PATTERNS = [
  /\botbetctbenn/i,
  /\bnaimenoban/i,
  /\bpotpebnoct/i,
  /\bicpolnitel/i,
  /\bppiлoж/i,
  /\bpacckazoba/i,
  /\bpoлyгoд/i,
];

/**
 * @param {string} text
 * @returns {{ ok: boolean, reason: string, garbledHeaders: number, mixedScriptWords: number, needsReocr: boolean }}
 */
function assessInquiryTextQuality(text) {
  const raw = String(text || "");
  if (!raw.trim()) {
    return {
      ok: false,
      reason: "empty",
      garbledHeaders: 0,
      mixedScriptWords: 0,
      needsReocr: true,
    };
  }

  const lower = raw.toLowerCase();
  let garbledHeaders = 0;

  for (const marker of HEADER_MARKERS) {
    const hasCyrillic = lower.includes(marker);
    const folded = foldHomoglyphs(marker);
    const hasLatinFold = folded !== marker && lower.includes(folded);
    if (!hasCyrillic && hasLatinFold) garbledHeaders++;
  }

  for (const re of GARBLED_HEADER_PATTERNS) {
    if (re.test(raw)) garbledHeaders++;
  }

  const mixedScriptWords = (
    raw.match(/(?<![\p{L}])[a-zA-Z]+[а-яА-ЯёЁ]+|[а-яА-ЯёЁ]+[a-zA-Z]+(?![\p{L}])/gu) ||
    []
  ).length;

  const needsReocr = garbledHeaders >= 2 || mixedScriptWords >= 4;
  const ok = !needsReocr;

  return {
    ok,
    reason: ok
      ? "ok"
      : garbledHeaders >= 2
        ? "garbled_headers"
        : "mixed_script",
    garbledHeaders,
    mixedScriptWords,
    needsReocr,
  };
}

function isLikelyPriceToken(token) {
  const s = String(token || "").trim().replace(/\s/g, "");
  if (!s) return false;
  if (/^\d{1,3}(?:[.,]\d{2})$/.test(s)) return true;
  if (/^\d+[.,]\d{2}\s*(?:руб|rub|₽)?$/i.test(s)) return true;
  return false;
}

/**
 * @param {Array<{ quantity?: number, unit?: string, raw?: string }>} lines
 * @returns {Array<{ id: string, lineIndex: number, message: string, hint?: string }>}
 */
function validateInquiryLines(lines = []) {
  const issues = [];

  lines.forEach((line, index) => {
    const raw = String(line?.raw || "");
    const qty = Number(line?.quantity);
    if (!raw || !Number.isFinite(qty)) return;

    const priceTokens = raw.match(/\d+(?:[.,]\d{2})/g) || [];
    for (const token of priceTokens) {
      const n = parseFloat(token.replace(",", "."));
      if (isLikelyPriceToken(token) && Math.abs(n - qty) < 0.01) {
        issues.push({
          id: "quantity-is-price",
          lineIndex: index,
          message: `Строка ${index + 1}: число ${token} похоже на цену, а не на кол-во`,
          hint: "Кол-во из колонки «Кол-во» / кг / шт; цены бери только из каталога ShopDB.",
        });
        break;
      }
    }

    if (line?.unit === "шт" && qty > 5000) {
      issues.push({
        id: "quantity-unlikely",
        lineIndex: index,
        message: `Строка ${index + 1}: кол-во ${qty} шт выглядит подозрительно`,
        hint: "Проверь OCR: возможно спутаны колонки кол-во и цена.",
      });
    }
  });

  return issues;
}

module.exports = {
  assessInquiryTextQuality,
  validateInquiryLines,
  isLikelyPriceToken,
};
