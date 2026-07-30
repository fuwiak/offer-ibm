"use strict";

const fs = require("fs");
const { QueueEvents } = require("bullmq");
const { isOfferKpQueueEnabled } = require("./constants");
const { enqueueOcrJob } = require("./enqueue");
const { getJobStatus, subscribeJobEvents } = require("./statusStore");
const { getOcrCache } = require("./cacheStore");
const { fileHashFromPath, buildOfferKpJobId } = require("./jobKey");
const {
  pipelineVersion,
  ocrPromptVersion,
  visionModelId,
  QUEUE_NAMES,
} = require("./constants");
const { bullmqConnectionOpts } = require("./redisClient");

/**
 * Run vision OCR via BullMQ GPU queue (concurrency 1) when enabled.
 * Falls back to inline `visionOcrPdf` if queue/Redis unavailable.
 *
 * @param {string} pdfPath
 * @param {{
 *   workspace?: object,
 *   contextText?: string,
 *   originalFilename?: string,
 *   onPage?: Function,
 *   onProgress?: Function,
 * }} opts
 */
async function runQueuedVisionOcr(pdfPath, opts = {}) {
  const { visionOcrPdf } = require("../offerKpVisionOcr");

  if (!isOfferKpQueueEnabled()) {
    return visionOcrPdf(pdfPath, opts);
  }

  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return visionOcrPdf(pdfPath, opts);
  }

  let enqueued;
  try {
    const fileHash = fileHashFromPath(fs, pdfPath);
    enqueued = await enqueueOcrJob({
      fileHash,
      pdfPath,
      originalFilename: opts.originalFilename || "",
      workspaceSlug: opts.workspace?.slug || null,
      contextText: opts.contextText || "",
    });
  } catch (error) {
    console.warn(
      "[offerKp:queue] enqueue OCR failed — inline fallback:",
      error?.message || error
    );
    return visionOcrPdf(pdfPath, opts);
  }

  if (!enqueued?.ok || enqueued.skipped) {
    return visionOcrPdf(pdfPath, opts);
  }

  if (enqueued.fromCache && enqueued.cached) {
    opts.onProgress?.({
      type: "stage",
      stage: "vision-ocr",
      fromCache: true,
      jobId: enqueued.jobId,
    });
    return {
      text: enqueued.cached.text,
      lines: enqueued.cached.lines || null,
      engine: enqueued.cached.engine || "qwen3-vl-cached",
    };
  }

  const jobId = enqueued.jobId;
  opts.onProgress?.({
    type: "stage",
    stage: "vision-ocr-queued",
    jobId,
    deduped: !!enqueued.deduped,
  });

  const cachedMid = await getOcrCache(jobId);
  if (cachedMid?.text) {
    return {
      text: cachedMid.text,
      lines: cachedMid.lines || null,
      engine: cachedMid.engine || "qwen3-vl-cached",
    };
  }

  return waitForOcrJob(jobId, opts);
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

    // Also listen to BullMQ QueueEvents for completion (belt + suspenders).
    events = new QueueEvents(QUEUE_NAMES.GPU, {
      connection: bullmqConnectionOpts(),
    });
    await events.waitUntilReady();

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await getJobStatus(jobId);
      if (status?.state === "completed") {
        const cached = await getOcrCache(jobId);
        if (cached?.text) {
          return {
            text: cached.text,
            lines: cached.lines || null,
            engine: cached.engine || "qwen3-vl-queue",
          };
        }
        if (status.result?.text) {
          return {
            text: status.result.text,
            lines: status.result.lines || null,
            engine: status.result.engine || "qwen3-vl-queue",
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
  buildOfferKpJobId,
  pipelineVersion,
  ocrPromptVersion,
  visionModelId,
};
