"use strict";

/** BullMQ queue names for OfferKP background work. */
const QUEUE_NAMES = Object.freeze({
  GPU: "offerkp-gpu",
  MATCHING: "offerkp-matching",
  EXPORT: "offerkp-export",
  INDEX_SYNC: "offerkp-index-sync",
});

/** User-facing pipeline stages (SSE / status store). */
const JOB_STAGES = Object.freeze([
  "uploaded",
  "ocr",
  "matching",
  "price_check",
  "export",
  "done",
  "failed",
]);

const DEFAULT_PIPELINE_VERSION = "2026-07-30";
const DEFAULT_OCR_PROMPT_VERSION = "v1";

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function isOfferKpQueueEnabled() {
  return envFlag("OFFER_KP_QUEUE", false);
}

function redisUrl() {
  return (
    process.env.OFFER_KP_REDIS_URL ||
    process.env.REDIS_URL ||
    "redis://127.0.0.1:6379"
  );
}

function pipelineVersion() {
  return (
    process.env.OFFER_KP_PIPELINE_VERSION ||
    DEFAULT_PIPELINE_VERSION
  ).trim();
}

function ocrPromptVersion() {
  return (
    process.env.OFFER_KP_OCR_PROMPT_VERSION ||
    DEFAULT_OCR_PROMPT_VERSION
  ).trim();
}

function visionModelId() {
  return (
    process.env.OFFER_KP_PIPELINE_VISION_MODEL ||
    process.env.LMSTUDIO_OCR_MODEL_PREF ||
    process.env.LMSTUDIO_MODEL_PREF ||
    "qwen/qwen3-vl-8b"
  ).trim();
}

module.exports = {
  QUEUE_NAMES,
  JOB_STAGES,
  DEFAULT_PIPELINE_VERSION,
  DEFAULT_OCR_PROMPT_VERSION,
  isOfferKpQueueEnabled,
  redisUrl,
  pipelineVersion,
  ocrPromptVersion,
  visionModelId,
  envFlag,
};
