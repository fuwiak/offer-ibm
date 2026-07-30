"use strict";

const {
  isOfferKpQueueEnabled,
  pipelineVersion,
  ocrPromptVersion,
  visionModelId,
  QUEUE_NAMES,
} = require("./constants");
const { buildOfferKpJobId } = require("./jobKey");
const { setJobStatus, getJobStatus } = require("./statusStore");
const { getOcrCache } = require("./cacheStore");
const {
  gpuQueue,
  matchingQueue,
  exportQueue,
  indexSyncQueue,
} = require("./queues");
const { pingRedis } = require("./redisClient");

async function assertQueueReady() {
  if (!isOfferKpQueueEnabled()) {
    return { ok: false, reason: "OFFER_KP_QUEUE disabled" };
  }
  const ping = await pingRedis();
  if (!ping.ok) {
    return { ok: false, reason: ping.error || "redis unavailable" };
  }
  return { ok: true };
}

/**
 * Enqueue GPU OCR (concurrency 1 on worker). Dedups by deterministic jobId.
 * Returns cached OCR immediately when present.
 */
async function enqueueOcrJob({
  fileHash,
  pdfPath,
  originalFilename = "",
  workspaceSlug = null,
  contextText = "",
} = {}) {
  const ready = await assertQueueReady();
  if (!ready.ok) return { ok: false, skipped: true, reason: ready.reason };

  const jobId = buildOfferKpJobId({
    fileHash,
    pipelineVersion: pipelineVersion(),
    modelId: visionModelId(),
    ocrPromptVersion: ocrPromptVersion(),
  });

  const cached = await getOcrCache(jobId);
  if (cached?.text) {
    const status = await setJobStatus(jobId, {
      type: QUEUE_NAMES.GPU,
      stage: "done",
      state: "completed",
      progress: 100,
      fromCache: true,
      filename: originalFilename,
      result: { chars: cached.text.length, engine: cached.engine || null },
    });
    return { ok: true, jobId, deduped: true, fromCache: true, status, cached };
  }

  const existing = await getJobStatus(jobId);
  if (
    existing &&
    ["waiting", "active", "delayed", "completed"].includes(existing.state)
  ) {
    return {
      ok: true,
      jobId,
      deduped: true,
      fromCache: false,
      status: existing,
    };
  }

  await setJobStatus(jobId, {
    type: QUEUE_NAMES.GPU,
    stage: "uploaded",
    state: "waiting",
    progress: 0,
    filename: originalFilename,
    fileHash,
  });

  const job = await gpuQueue().add(
    "vision-ocr",
    {
      jobId,
      fileHash,
      pdfPath,
      originalFilename,
      workspaceSlug,
      contextText: String(contextText || "").slice(0, 8000),
      pipelineVersion: pipelineVersion(),
      modelId: visionModelId(),
      ocrPromptVersion: ocrPromptVersion(),
    },
    {
      jobId,
      attempts: 2,
      backoff: { type: "exponential", delay: 8000 },
    }
  );

  return {
    ok: true,
    jobId,
    bullJobId: job.id,
    deduped: false,
    fromCache: false,
    status: await getJobStatus(jobId),
  };
}

async function enqueueMatchingJob(payload = {}) {
  const ready = await assertQueueReady();
  if (!ready.ok) return { ok: false, skipped: true, reason: ready.reason };

  const jobId =
    payload.jobId ||
    buildOfferKpJobId({
      fileHash: payload.fileHash || `match-${Date.now()}`,
    });

  await setJobStatus(jobId, {
    type: QUEUE_NAMES.MATCHING,
    stage: "matching",
    state: "waiting",
    progress: 0,
  });

  const job = await matchingQueue().add("match-inquiry", { ...payload, jobId }, {
    jobId: `${jobId}-match`,
    attempts: 2,
  });
  return { ok: true, jobId, bullJobId: job.id };
}

async function enqueueExportJob(payload = {}) {
  const ready = await assertQueueReady();
  if (!ready.ok) return { ok: false, skipped: true, reason: ready.reason };

  const jobId =
    payload.jobId ||
    `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await setJobStatus(jobId, {
    type: QUEUE_NAMES.EXPORT,
    stage: "export",
    state: "waiting",
    progress: 0,
    format: payload.format || "docx",
  });

  const job = await exportQueue().add("export-quote", { ...payload, jobId }, {
    jobId,
    attempts: 2,
  });
  return { ok: true, jobId, bullJobId: job.id };
}

async function enqueueIndexSyncJob(payload = {}) {
  const ready = await assertQueueReady();
  if (!ready.ok) return { ok: false, skipped: true, reason: ready.reason };

  const jobId = `index-sync-${pipelineVersion()}`;
  await setJobStatus(jobId, {
    type: QUEUE_NAMES.INDEX_SYNC,
    stage: "uploaded",
    state: "waiting",
    progress: 0,
  });

  const job = await indexSyncQueue().add(
    "sync-canonical-index",
    { ...payload, jobId },
    {
      jobId,
      attempts: 1,
    }
  );
  return { ok: true, jobId, bullJobId: job.id };
}

module.exports = {
  assertQueueReady,
  enqueueOcrJob,
  enqueueMatchingJob,
  enqueueExportJob,
  enqueueIndexSyncJob,
};
