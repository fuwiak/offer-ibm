"use strict";

const {
  QUEUE_NAMES,
  isOfferKpQueueEnabled,
  redisUrl,
  pipelineVersion,
} = require("./constants");
const { buildOfferKpJobId, retrievalCacheKey } = require("./jobKey");
const { pingRedis, closeSharedRedis } = require("./redisClient");
const { setJobStatus, getJobStatus, subscribeJobEvents } = require("./statusStore");
const {
  getOcrCache,
  setOcrCache,
  getRetrievalCache,
  setRetrievalCache,
  getPriceCache,
  setPriceCache,
  acquireIndexSyncLock,
  releaseIndexSyncLock,
} = require("./cacheStore");
const {
  gpuQueue,
  matchingQueue,
  exportQueue,
  indexSyncQueue,
  closeAllQueues,
  DEFAULT_JOB_OPTS,
} = require("./queues");
const {
  assertQueueReady,
  enqueueOcrJob,
  enqueueMatchingJob,
  enqueueExportJob,
  enqueueIndexSyncJob,
} = require("./enqueue");
const { runQueuedVisionOcr, waitForOcrJob } = require("./runQueuedVisionOcr");

module.exports = {
  QUEUE_NAMES,
  isOfferKpQueueEnabled,
  redisUrl,
  pipelineVersion,
  buildOfferKpJobId,
  retrievalCacheKey,
  pingRedis,
  closeSharedRedis,
  setJobStatus,
  getJobStatus,
  subscribeJobEvents,
  getOcrCache,
  setOcrCache,
  getRetrievalCache,
  setRetrievalCache,
  getPriceCache,
  setPriceCache,
  acquireIndexSyncLock,
  releaseIndexSyncLock,
  gpuQueue,
  matchingQueue,
  exportQueue,
  indexSyncQueue,
  closeAllQueues,
  DEFAULT_JOB_OPTS,
  assertQueueReady,
  enqueueOcrJob,
  enqueueMatchingJob,
  enqueueExportJob,
  enqueueIndexSyncJob,
  runQueuedVisionOcr,
  waitForOcrJob,
};
