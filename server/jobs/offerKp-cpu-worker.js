"use strict";

/**
 * OfferKP CPU worker — matching, export, index-sync.
 *
 * systemd: offer-kp-cpu-worker.service
 *   node server/jobs/offerKp-cpu-worker.js
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
const {
  processMatchingJob,
  processExportJob,
  processIndexSyncJob,
} = require("./offerKpProcessors");

const matchingConcurrency = Math.max(
  1,
  Number(process.env.OFFER_KP_MATCHING_WORKER_CONCURRENCY || 2)
);
const exportConcurrency = Math.max(
  1,
  Number(process.env.OFFER_KP_EXPORT_WORKER_CONCURRENCY || 2)
);
const indexConcurrency = 1;

console.log(
  `[offerKp:cpu-worker] start matching=${matchingConcurrency} export=${exportConcurrency} index=1`
);

function attachFailHandler(worker, label) {
  worker.on("failed", async (job, err) => {
    const jobId = job?.data?.jobId || job?.id;
    console.error(
      `[offerKp:cpu-worker:${label}] failed ${jobId}:`,
      err?.message || err
    );
    if (jobId) {
      await setJobStatus(jobId, {
        stage: "failed",
        state: "failed",
        error: err?.message || String(err),
      }).catch(() => {});
    }
  });
  worker.on("completed", (job) => {
    console.log(`[offerKp:cpu-worker:${label}] completed ${job?.id}`);
  });
  return worker;
}

const matchingWorker = attachFailHandler(
  new Worker(QUEUE_NAMES.MATCHING, async (job) => processMatchingJob(job), {
    connection: bullmqConnectionOpts(),
    concurrency: matchingConcurrency,
    lockDuration: 300000,
  }),
  "matching"
);

const exportWorker = attachFailHandler(
  new Worker(QUEUE_NAMES.EXPORT, async (job) => processExportJob(job), {
    connection: bullmqConnectionOpts(),
    concurrency: exportConcurrency,
    lockDuration: 180000,
  }),
  "export"
);

const indexWorker = attachFailHandler(
  new Worker(QUEUE_NAMES.INDEX_SYNC, async (job) => processIndexSyncJob(job), {
    connection: bullmqConnectionOpts(),
    concurrency: indexConcurrency,
    lockDuration: 3600000,
  }),
  "index-sync"
);

async function shutdown(signal) {
  console.log(`[offerKp:cpu-worker] ${signal} — closing`);
  await Promise.all([
    matchingWorker.close(),
    exportWorker.close(),
    indexWorker.close(),
  ]);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
