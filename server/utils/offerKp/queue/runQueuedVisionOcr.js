"use strict";

const fs = require("fs");
const { QueueEvents } = require("bullmq");
const { isOfferKpQueueEnabled } = require("./constants");
const { enqueueOcrJob } = require("./enqueue");
const { getJobStatus, subscribeJobEvents } = require("./statusStore");
const { getOcrCache, setOcrCache } = require("./cacheStore");
const { fileHashFromPath, buildOfferKpJobId } = require("./jobKey");
const {
  pipelineVersion,
  ocrPromptVersion,
  visionModelId,
  QUEUE_NAMES,
} = require("./constants");
const { bullmqConnectionOpts } = require("./redisClient");

function resolveJobIdForPdf(pdfPath) {
  const fileHash = fileHashFromPath(fs, pdfPath);
  const jobId = buildOfferKpJobId({
    fileHash,
    pipelineVersion: pipelineVersion(),
    modelId: visionModelId(),
    ocrPromptVersion: ocrPromptVersion(),
  });
  return { fileHash, jobId };
}

function cachedToResult(cached) {
  return {
    text: cached.text,
    lines: cached.lines || null,
    engine: cached.engine || "qwen3-vl-cached",
    fromCache: true,
    cacheSource: cached.source || "cache",
  };
}

/**
 * Always try durable OCR (Redis→disk) before GPU.
 * Then queue (if enabled) or inline visionOcrPdf — and persist result.
 */
async function runQueuedVisionOcr(pdfPath, opts = {}) {
  const { visionOcrPdf } = require("../offerKpVisionOcr");

  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return visionOcrPdf(pdfPath, opts);
  }

  let fileHash = null;
  let jobId = null;
  try {
    ({ fileHash, jobId } = resolveJobIdForPdf(pdfPath));
  } catch (error) {
    console.warn(
      "[offerKp:ocr] jobId build failed — GPU without cache:",
      error?.message || error
    );
    return visionOcrPdf(pdfPath, opts);
  }

  // 1) Redis → disk — GPU last resort
  const pre = await getOcrCache(jobId);
  if (pre?.text) {
    opts.onProgress?.({
      type: "stage",
      stage: "vision-ocr",
      fromCache: true,
      cacheSource: pre.source || "cache",
      jobId,
    });
    return cachedToResult(pre);
  }

  // 2) BullMQ GPU worker (serialized concurrency 1)
  if (isOfferKpQueueEnabled()) {
    try {
      const enqueued = await enqueueOcrJob({
        fileHash,
        pdfPath,
        originalFilename: opts.originalFilename || "",
        workspaceSlug: opts.workspace?.slug || null,
        contextText: opts.contextText || "",
      });

      if (enqueued?.ok && !enqueued.skipped) {
        if (enqueued.fromCache && enqueued.cached?.text) {
          opts.onProgress?.({
            type: "stage",
            stage: "vision-ocr",
            fromCache: true,
            jobId: enqueued.jobId,
          });
          return cachedToResult(enqueued.cached);
        }

        opts.onProgress?.({
          type: "stage",
          stage: "vision-ocr-queued",
          jobId: enqueued.jobId,
          deduped: !!enqueued.deduped,
        });

        const mid = await getOcrCache(enqueued.jobId);
        if (mid?.text) return cachedToResult(mid);

        return waitForOcrJob(enqueued.jobId, opts);
      }
    } catch (error) {
      console.warn(
        "[offerKp:queue] enqueue OCR failed — inline GPU:",
        error?.message || error
      );
    }
  }

  // 3) Inline GPU — then durable persist
  opts.onProgress?.({
    type: "stage",
    stage: "vision-ocr",
    fromCache: false,
    jobId,
  });
  const result = await visionOcrPdf(pdfPath, opts);
  const text = typeof result === "string" ? result : result?.text || "";
  const lines =
    typeof result === "object" && result ? result.lines || null : null;
  const engine =
    (typeof result === "object" && result?.engine) || "qwen3-vl-inline";

  if (text.trim()) {
    await setOcrCache(jobId, {
      text,
      lines,
      engine,
      pdfPath,
      fileHash,
    }).catch(() => {});
  }

  return typeof result === "string"
    ? { text: result, lines: null, engine, fromCache: false }
    : { ...result, fromCache: false };
}

async function waitForOcrJob(jobId, opts = {}) {
  const timeoutMs = Number(process.env.OFFER_KP_OCR_JOB_TIMEOUT_MS || 600000);
  let unsubscribe = null;
  let events = null;

  try {
    unsubscribe = await subscribeJobEvents(jobId, (status) => {
      if (status?.stage === "ocr" || status?.page) {
        opts.onProgress?.({
          type: "ocr_progress",
          engine: "qwen3-vl-queue",
          page: status.page || null,
          total: status.total || null,
          jobId,
          progress: status.progress,
        });
        if (status.page && opts.onPage) {
          opts.onPage({
            pageNumber: status.page,
            total: status.total || status.page,
          });
        }
      }
      opts.onProgress?.({
        type: "job_status",
        jobId,
        stage: status.stage,
        state: status.state,
        progress: status.progress,
        error: status.error || null,
      });
    });

    events = new QueueEvents(QUEUE_NAMES.GPU, {
      connection: bullmqConnectionOpts(),
    });
    await events.waitUntilReady();

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await getJobStatus(jobId);
      if (status?.state === "completed") {
        const cached = await getOcrCache(jobId);
        if (cached?.text) return cachedToResult(cached);
        if (status.result?.text) {
          return {
            text: status.result.text,
            lines: status.result.lines || null,
            engine: status.result.engine || "qwen3-vl-queue",
            fromCache: false,
          };
        }
      }
      if (status?.state === "failed") {
        throw new Error(status.error || "OCR job failed");
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    throw new Error(`OCR job timeout after ${timeoutMs}ms (${jobId})`);
  } finally {
    if (unsubscribe) await unsubscribe().catch(() => {});
    if (events) await events.close().catch(() => {});
  }
}

module.exports = {
  runQueuedVisionOcr,
  waitForOcrJob,
  resolveJobIdForPdf,
  buildOfferKpJobId,
  pipelineVersion,
  ocrPromptVersion,
  visionModelId,
};
