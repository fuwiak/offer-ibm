"use strict";

const { resolveOfferKpEffectiveModel } = require("../../config/offerKp.models");
const { offerKpLog } = require("../offerKpApp/offerKpLog");
const { parseInquiryText } = require("./parseInquiry");
const { hasHardwareSignals } = require("./productSearchAgent");
const { isQuoteDocumentRequest } = require("./quoteRequestPhrases");
const { detectQuoteCreationIntentSync } = require("./quoteIntentJudge");

const DEFAULT_WEAK_MODELS = ["openai/gpt-oss-20b"];
const DEFAULT_FALLBACK_CHAIN = [
  "google/gemma-4-12b",
  "google/gemma-4-12b-qat",
  "deepseek/deepseek-r1-0528-qwen3-8b",
];

function quotePdfModelAutoSwitchEnabled() {
  return (
    String(process.env.OFFER_KP_QUOTE_PDF_MODEL_AUTO_SWITCH || "true")
      .trim()
      .toLowerCase() !== "false"
  );
}

function parseCsvList(raw = "", fallback = []) {
  const items = String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

function weakModelsForQuotePdf() {
  return parseCsvList(
    process.env.OFFER_KP_QUOTE_PDF_WEAK_MODELS,
    DEFAULT_WEAK_MODELS
  );
}

function fallbackModelsForQuotePdf() {
  return parseCsvList(
    process.env.OFFER_KP_QUOTE_PDF_MODEL_FALLBACK_CHAIN,
    DEFAULT_FALLBACK_CHAIN
  );
}

function normalizeModelId(modelId) {
  return String(modelId || "").trim();
}

function modelMatchesWeakList(modelId, weakList = weakModelsForQuotePdf()) {
  const id = normalizeModelId(modelId).toLowerCase();
  if (!id) return false;
  return weakList.some((weak) => {
    const w = String(weak || "")
      .trim()
      .toLowerCase();
    if (!w) return false;
    return id === w || id.includes(w);
  });
}

function isPdfParsedFile(file = {}) {
  const title = String(file.title || file.filename || "").toLowerCase();
  if (/\.pdf$/i.test(title)) return true;
  const mime = String(file.mimetype || file.mime || "").toLowerCase();
  return mime.includes("pdf");
}

function isQuoteRelatedMessage(message = "") {
  const msg = String(message || "").trim();
  if (!msg) return false;
  if (isQuoteDocumentRequest(msg)) return true;
  if (detectQuoteCreationIntentSync([msg])) return true;
  if (/\bкп\b|коммерческ|оферт|ofert|quote|propozycj/i.test(msg)) return true;
  if (
    /pdf|заявк|документ|прикрепл|upload|файл|attachment/i.test(msg) &&
    /\bкп\b|коммерческ|цен|позиц|каталог|налич/i.test(msg)
  ) {
    return true;
  }
  return false;
}

/**
 * PDF/заявка должна содержать признаки позиций или цен — иначе переключение бессмысленно.
 */
function parsedTextHasQuoteSignals(text = "") {
  const combined = String(text || "").trim();
  if (!combined || combined.length < 30) return false;

  if (parseInquiryText(combined).length > 0) return true;
  if (hasHardwareSignals(combined)) return true;

  if (/\b\d+[.,]\d{2}\s*(руб|₽|eur|usd|zł|pln)?\b/i.test(combined)) {
    return true;
  }
  if (
    /(наименован|артикул|кол-?во|количеств|qty|price|цена|сумма|ед\.?\s*изм)/i.test(
      combined
    )
  ) {
    return true;
  }

  return false;
}

function pickQuotePdfFallbackModel(currentModel, availableModels = null) {
  const current = normalizeModelId(currentModel);
  const chain = fallbackModelsForQuotePdf();
  const available = Array.isArray(availableModels)
    ? new Set(availableModels.map(normalizeModelId))
    : null;

  for (const candidate of chain) {
    const id = normalizeModelId(candidate);
    if (!id || id === current) continue;
    if (available && !available.has(id)) continue;
    return id;
  }

  for (const candidate of chain) {
    const id = normalizeModelId(candidate);
    if (id && id !== current) return id;
  }

  return null;
}

/**
 * Ответ не использует данные из PDF-заявки (модель «не видит» файл).
 */
function responseMissesParsedQuote({
  responseText = "",
  parsedFileTexts = [],
} = {}) {
  const texts = (parsedFileTexts || []).filter(Boolean);
  if (!texts.length) return false;

  const combined = texts.join("\n");
  if (!parsedTextHasQuoteSignals(combined)) return false;

  const inquiryLines = parseInquiryText(combined);
  const response = String(responseText || "").toLowerCase();
  if (!response.trim()) return true;

  const tokens = new Set();
  for (const line of inquiryLines) {
    for (const value of [
      line.standard,
      line.size,
      line.productType,
      line.rawLine,
    ]) {
      const token = String(value || "").trim();
      if (token.length >= 3) tokens.add(token.toLowerCase());
    }
  }

  if (tokens.size === 0) {
    const hardware = combined.match(/\b(?:din|gost)\s*\d{3,5}\b/gi) || [];
    for (const hit of hardware) tokens.add(hit.toLowerCase());
  }

  if (tokens.size === 0) {
    const priceHits = (combined.match(/\b\d+[.,]\d{2}\b/g) || []).slice(0, 5);
    if (!priceHits.length) return false;
    const matchedPrices = priceHits.filter((p) => response.includes(p));
    return matchedPrices.length === 0;
  }

  let hits = 0;
  for (const token of tokens) {
    if (response.includes(token)) hits += 1;
  }

  return hits === 0;
}

/**
 * @param {object} opts
 * @param {string} opts.message
 * @param {object} opts.workspace
 * @param {object[]} [opts.parsedFiles]
 * @param {string[]} [opts.parsedFileTexts]
 * @param {string[]|null} [opts.availableModels]
 * @returns {{ from: string, model: string, provider: string, reason: string }|null}
 */
function resolveQuotePdfModelSwitch({
  message,
  workspace,
  parsedFiles = [],
  parsedFileTexts = [],
  availableModels = null,
} = {}) {
  if (!quotePdfModelAutoSwitchEnabled()) return null;
  if (!workspace?.slug) return null;
  if (!isQuoteRelatedMessage(message)) return null;

  const files = Array.isArray(parsedFiles) ? parsedFiles : [];
  const texts = (parsedFileTexts || []).filter(Boolean).length
    ? parsedFileTexts.filter(Boolean)
    : files.map((doc) => doc.pageContent).filter(Boolean);

  const hasPdf = files.some(isPdfParsedFile);
  if (!hasPdf && !texts.length) return null;

  const combined = texts.join("\n");
  if (!parsedTextHasQuoteSignals(combined)) return null;

  const currentModel = resolveOfferKpEffectiveModel(workspace);

  if (!modelMatchesWeakList(currentModel)) return null;

  const fallbackModel = pickQuotePdfFallbackModel(
    currentModel,
    availableModels
  );
  if (!fallbackModel || fallbackModel === currentModel) return null;

  const result = {
    from: currentModel,
    model: fallbackModel,
    provider: workspace?.chatProvider || "lmstudio",
    reason: "quote_pdf_document",
  };

  offerKpLog("info", "Quote PDF model auto-switch", {
    workspace: workspace.slug,
    from: result.from,
    to: result.model,
    hasPdf,
    parsedChars: combined.length,
    message: String(message).slice(0, 120),
  });

  return result;
}

module.exports = {
  quotePdfModelAutoSwitchEnabled,
  isQuoteRelatedMessage,
  isPdfParsedFile,
  parsedTextHasQuoteSignals,
  modelMatchesWeakList,
  pickQuotePdfFallbackModel,
  responseMissesParsedQuote,
  resolveQuotePdfModelSwitch,
};
