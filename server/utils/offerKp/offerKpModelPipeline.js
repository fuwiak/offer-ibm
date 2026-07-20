/**
 * Dual-model pipeline on Lainey (T4 16GB):
 *   eyes  = Qwen3-VL Thinking  → OCR/JSON only (no prices/SKU)
 *   brain = gpt-oss-20b        → agent tools / retry / ambiguity
 *   truth = ShopDB + matchInquiry + analogRules + quote PDF
 *
 * Both models cannot fit in VRAM together → sequential unload/load.
 * All swaps go through a single lock so GPU never gets concurrent loads.
 */

"use strict";

const { offerKpLog } = require("../offerKpApp/offerKpLog");

const DEFAULT_VISION_MODEL = "qwen/qwen3-vl-8b-thinking";
const DEFAULT_AGENT_MODEL = "openai/gpt-oss-20b";
const DEFAULT_AGENT_FALLBACK = "qwen/qwen3-vl-8b";
const DEFAULT_AGENT_CONTEXT = 32768;

/** @type {Promise<unknown>} */
let pipelineSwitchLock = Promise.resolve();
/** @type {{ stage: string, modelId: string, at: string } | null} */
let lastPipelineSwitch = null;

function normalizeModelId(modelId) {
  return String(modelId || "").trim();
}

function normalizePipelineStage(stage) {
  const s = String(stage || "")
    .trim()
    .toLowerCase();
  if (["vision", "eyes", "ocr", "oczy"].includes(s)) return "vision";
  if (["agent", "brain", "chat", "mozog", "mózg"].includes(s)) return "agent";
  if (["unload", "free", "idle", "none"].includes(s)) return "unload";
  return null;
}

function withPipelineSwitchLock(fn) {
  const run = pipelineSwitchLock.then(fn, fn);
  pipelineSwitchLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
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
 * @param {"vision"|"agent"|string} stage
 * @returns {{ stage: string, modelId: string, contextLength?: number, role: string } | null}
 */
function resolvePipelineModel(stage) {
  const normalized = normalizePipelineStage(stage);
  if (normalized === "unload") {
    return { stage: "unload", modelId: "", role: "idle" };
  }
  if (normalized === "vision") {
    return {
      stage: "vision",
      modelId: resolvePipelineVisionModel(),
      role: "eyes",
    };
  }
  if (normalized === "agent") {
    const modelId = resolvePipelineAgentModel();
    return {
      stage: "agent",
      modelId,
      contextLength: resolvePipelineAgentContext(modelId),
      role: "brain",
    };
  }
  return null;
}

/**
 * Snapshot of intended stages vs currently loaded LM Studio models.
 */
async function getPipelineRuntimeStatus(opts = {}) {
  const {
    fetchLmStudioModelCatalog,
    lmStudioBaseUrl,
  } = require("../offerKpApp/lmStudioModels");

  const eyes = resolvePipelineModel("vision");
  const brain = resolvePipelineModel("agent");
  const catalog = await fetchLmStudioModelCatalog({
    basePath: opts.basePath || lmStudioBaseUrl(),
    apiKey: opts.apiKey,
    forceRefresh: opts.forceRefresh !== false,
  });
  const loadedIds = catalog.loadedIds || [];
  const active =
    loadedIds.find((id) => id === eyes.modelId) ||
    loadedIds.find((id) => id === brain.modelId) ||
    loadedIds[0] ||
    null;

  let activeStage = null;
  if (active === eyes.modelId) activeStage = "vision";
  else if (active === brain.modelId) activeStage = "agent";
  else if (active) activeStage = "other";

  return {
    ok: true,
    gpuPolicy: "sequential-swap",
    eyes,
    brain,
    loadedIds,
    activeModel: active,
    activeStage,
    lastSwitch: lastPipelineSwitch,
  };
}

/**
 * Load eyes or brain into LM Studio VRAM (unloads the other).
 * Skips reload when the target is already loaded with enough context
 * (unless opts.force). On agent load failure for gpt-oss, falls back once.
 */
async function ensurePipelineModelLoaded(stage, opts = {}) {
  return withPipelineSwitchLock(async () => {
    const {
      loadLmStudioModel,
      unloadAllLoadedLmStudioModels,
      lmStudioBaseUrl,
    } = require("../offerKpApp/lmStudioModels");

    const normalized = normalizePipelineStage(stage);
    if (!normalized) {
      throw new Error(
        `Unknown pipeline stage "${stage}". Use eyes|brain|unload.`
      );
    }

    if (normalized === "unload") {
      const unloadedIds = await unloadAllLoadedLmStudioModels({
        basePath: opts.basePath || lmStudioBaseUrl(),
        apiKey: opts.apiKey,
      });
      lastPipelineSwitch = {
        stage: "unload",
        modelId: "",
        at: new Date().toISOString(),
      };
      offerKpLog("info", "Pipeline VRAM unloaded", { unloadedIds });
      return {
        success: true,
        stage: "unload",
        modelId: "",
        role: "idle",
        unloadedIds,
        alreadyLoaded: false,
        fallbackUsed: false,
      };
    }

    const resolved = resolvePipelineModel(normalized);
    const loadOpts = {
      ...opts,
      // Default false: skip thrash when already on the right model.
      force: opts.force === true,
      contextLength: resolved.contextLength,
    };

    try {
      const result = await loadLmStudioModel(resolved.modelId, loadOpts);
      lastPipelineSwitch = {
        stage: resolved.stage,
        modelId: resolved.modelId,
        at: new Date().toISOString(),
      };
      offerKpLog("info", "Pipeline model loaded", {
        stage: resolved.stage,
        role: resolved.role,
        model: resolved.modelId,
        contextLength: resolved.contextLength || null,
        via: result?.via || null,
        alreadyLoaded: Boolean(result?.alreadyLoaded),
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
      lastPipelineSwitch = {
        stage: "agent",
        modelId: fallback,
        at: new Date().toISOString(),
      };
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
  });
}

/** Alias for ops / API: switchPipelineStage("eyes"|"brain"|"unload"). */
async function switchPipelineStage(stage, opts = {}) {
  return ensurePipelineModelLoaded(stage, opts);
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
  normalizePipelineStage,
  resolvePipelineVisionModel,
  resolvePipelineAgentModel,
  resolvePipelineAgentFallbackModel,
  resolvePipelineAgentContext,
  resolvePipelineModel,
  ensurePipelineModelLoaded,
  switchPipelineStage,
  getPipelineRuntimeStatus,
  needsVisionOcrStage,
  withPipelineSwitchLock,
};
