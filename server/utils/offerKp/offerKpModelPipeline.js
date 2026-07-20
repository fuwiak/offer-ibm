/**
 * Dual-model pipeline on Lainey (T4 16GB):
 *   eyes  = Qwen3-VL Thinking  → OCR/JSON only (no prices/SKU)
 *   brain = gpt-oss-20b        → agent tools / retry / ambiguity
 *   truth = ShopDB + matchInquiry + analogRules + quote PDF
 *
 * Both models cannot fit in VRAM together → sequential unload/load.
 */

"use strict";

const { offerKpLog } = require("../offerKpApp/offerKpLog");

const DEFAULT_VISION_MODEL = "qwen/qwen3-vl-8b-thinking";
const DEFAULT_AGENT_MODEL = "openai/gpt-oss-20b";
const DEFAULT_AGENT_FALLBACK = "qwen/qwen3-vl-8b";
const DEFAULT_AGENT_CONTEXT = 32768;

function normalizeModelId(modelId) {
  return String(modelId || "").trim();
}

function resolvePipelineVisionModel() {
  return (
    normalizeModelId(process.env.OFFER_KP_PIPELINE_VISION_MODEL) ||
    DEFAULT_VISION_MODEL
  );
}

function resolvePipelineAgentModel({ allowFallback = true } = {}) {
  const preferred =
    normalizeModelId(process.env.OFFER_KP_PIPELINE_AGENT_MODEL) ||
    normalizeModelId(process.env.LMSTUDIO_MODEL_PREF) ||
    DEFAULT_AGENT_MODEL;
  if (!allowFallback) return preferred;
  return preferred;
}

function resolvePipelineAgentFallbackModel() {
  return (
    normalizeModelId(process.env.OFFER_KP_PIPELINE_AGENT_FALLBACK) ||
    DEFAULT_AGENT_FALLBACK
  );
}

function resolvePipelineAgentContext(modelId = null) {
  const id = normalizeModelId(modelId || resolvePipelineAgentModel()).toLowerCase();
  const envCtx = Number(process.env.OFFER_KP_PIPELINE_AGENT_CONTEXT);
  if (Number.isFinite(envCtx) && envCtx > 0) return envCtx;
  if (id.includes("gpt-oss") || id.includes("20b")) return DEFAULT_AGENT_CONTEXT;
  return Number(process.env.LMSTUDIO_MODEL_TOKEN_LIMIT) || 32768;
}

/**
 * @param {"vision"|"agent"} stage
 * @returns {{ stage: string, modelId: string, contextLength?: number, role: string }}
 */
function resolvePipelineModel(stage) {
  const s = String(stage || "").trim().toLowerCase();
  if (s === "vision" || s === "eyes" || s === "ocr") {
    return {
      stage: "vision",
      modelId: resolvePipelineVisionModel(),
      role: "eyes",
    };
  }
  const modelId = resolvePipelineAgentModel();
  return {
    stage: "agent",
    modelId,
    contextLength: resolvePipelineAgentContext(modelId),
    role: "brain",
  };
}

/**
 * Load eyes or brain into LM Studio VRAM (unloads the other).
 * On agent load failure for gpt-oss, falls back to qwen3-vl-8b once.
 */
async function ensurePipelineModelLoaded(stage, opts = {}) {
  const {
    loadLmStudioModel,
  } = require("../offerKpApp/lmStudioModels");

  const resolved = resolvePipelineModel(stage);
  const loadOpts = {
    force: opts.force !== false,
    contextLength: resolved.contextLength,
    ...opts,
  };

  try {
    const result = await loadLmStudioModel(resolved.modelId, loadOpts);
    offerKpLog("info", "Pipeline model loaded", {
      stage: resolved.stage,
      role: resolved.role,
      model: resolved.modelId,
      contextLength: resolved.contextLength || null,
      via: result?.via || null,
    });
    return { ...result, ...resolved, fallbackUsed: false };
  } catch (error) {
    if (resolved.stage !== "agent") throw error;
    const fallback = resolvePipelineAgentFallbackModel();
    if (!fallback || fallback === resolved.modelId) throw error;

    offerKpLog("warn", "Pipeline agent model failed — using fallback brain", {
      preferred: resolved.modelId,
      fallback,
      error: error?.message || String(error),
    });
    const result = await loadLmStudioModel(fallback, {
      ...loadOpts,
      contextLength: resolvePipelineAgentContext(fallback),
    });
    return {
      ...result,
      stage: "agent",
      modelId: fallback,
      role: "brain",
      contextLength: resolvePipelineAgentContext(fallback),
      fallbackUsed: true,
      preferredModel: resolved.modelId,
    };
  }
}

function needsVisionOcrStage(documents = [], filename = "") {
  const { documentsNeedVisionOcr } = require("./offerKpDocumentIngest");
  const { isPdfFilename } = require("../parsedFileOriginal");
  if (filename && !isPdfFilename(filename)) {
    // images may still need vision; PDF gate is in ingest
  }
  return documentsNeedVisionOcr(documents);
}

module.exports = {
  DEFAULT_VISION_MODEL,
  DEFAULT_AGENT_MODEL,
  DEFAULT_AGENT_FALLBACK,
  DEFAULT_AGENT_CONTEXT,
  resolvePipelineVisionModel,
  resolvePipelineAgentModel,
  resolvePipelineAgentFallbackModel,
  resolvePipelineAgentContext,
  resolvePipelineModel,
  ensurePipelineModelLoaded,
  needsVisionOcrStage,
};
