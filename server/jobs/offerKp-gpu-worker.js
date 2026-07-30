"use strict";

/**
 * OfferKP GPU worker — Vision OCR only.
 * Concurrency MUST stay 1: Qwen3-VL already saturates T4.
 *
 * systemd: offer-kp-gpu-worker.service
 *   node server/jobs/offerKp-gpu-worker.js
 */

const { loadEnv } = require("../config/loadEnv");
loadEnv();

const {
  applyOfferKpLlmDefaults,
} = require("../config/applyOfferKpLlmDefaults");
applyOfferKpLlmDefaults();

const { Worker } = require("bullmq");
const { QUEUE_NAMES } = require("../utils/offerKp/queue/constants");
const { bullmqConnectionOpts } = require("../utils/offerKp/queue/redisClient");
const { setJobStatus } = require("../utils/offerKp/queue/statusStore");
const { processGpuOcrJob } = require("./offerKpProcessors");

const concurrency = Math.max(
  1,
  Number(process.env.OFFER_KP_GPU_WORKER_CONCURRENCY || 1)
);

console.log(
  `[offerKp:gpu-worker] start queue=${QUEUE_NAMES.GPU} concurrency=${concurrency}`
);

const worker = new Worker(
  QUEUE_NAMES.GPU,
  async (job) => {
    console.log(`[offerKp:gpu-worker] job ${job.id} name=${job.name}`);
    return processGpuOcrJob(job);
  },
  {
    connection: bullmqConnectionOpts(),
    concurrency,
    lockDuration: Number(process.env.OFFER_KP_GPU_LOCK_MS || 600000),
  }
);

worker.on("failed", async (job, err) => {
  const jobId = job?.data?.jobId || job?.id;
  console.error(`[offerKp:gpu-worker] failed ${jobId}:`, err?.message || err);
  if (jobId) {
    await setJobStatus(jobId, {
      stage: "failed",
      state: "failed",
      error: err?.message || String(err),
    }).catch(() => {});
  }
});

worker.on("completed", (job) => {
  console.log(`[offerKp:gpu-worker] completed ${job?.id}`);
});

async function shutdown(signal) {
  console.log(`[offerKp:gpu-worker] ${signal} — closing`);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
