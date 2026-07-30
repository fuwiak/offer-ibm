"use strict";

const { Queue } = require("bullmq");
const { QUEUE_NAMES } = require("./constants");
const { bullmqConnectionOpts } = require("./redisClient");

/** @type {Map<string, Queue>} */
const queues = new Map();

const DEFAULT_JOB_OPTS = Object.freeze({
  attempts: 2,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 24 * 3600, count: 500 },
  removeOnFail: { age: 7 * 24 * 3600, count: 200 },
});

function getQueue(name) {
  if (queues.has(name)) return queues.get(name);
  const queue = new Queue(name, {
    connection: bullmqConnectionOpts(),
    defaultJobOptions: DEFAULT_JOB_OPTS,
  });
  queues.set(name, queue);
  return queue;
}

function gpuQueue() {
  return getQueue(QUEUE_NAMES.GPU);
}

function matchingQueue() {
  return getQueue(QUEUE_NAMES.MATCHING);
}

function exportQueue() {
  return getQueue(QUEUE_NAMES.EXPORT);
}

function indexSyncQueue() {
  return getQueue(QUEUE_NAMES.INDEX_SYNC);
}

async function closeAllQueues() {
  const list = [...queues.values()];
  queues.clear();
  await Promise.all(
    list.map(async (q) => {
      try {
        await q.close();
      } catch (_) {
        /* ignore */
      }
    })
  );
}

module.exports = {
  DEFAULT_JOB_OPTS,
  getQueue,
  gpuQueue,
  matchingQueue,
  exportQueue,
  indexSyncQueue,
  closeAllQueues,
  bullmqConnectionOpts,
};
