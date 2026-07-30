"use strict";

const { getSharedRedis } = require("./redisClient");

const KEY_PREFIX = "offerkp:job:";
const CHANNEL_PREFIX = "offerkp:job:events:";
const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24h

function statusKey(jobId) {
  return `${KEY_PREFIX}${jobId}`;
}

function eventsChannel(jobId) {
  return `${CHANNEL_PREFIX}${jobId}`;
}

/**
 * Persist job status/progress in Redis (not the full payload).
 * @param {string} jobId
 * @param {Record<string, unknown>} patch
 */
async function setJobStatus(jobId, patch = {}, { ttlSec = DEFAULT_TTL_SEC } = {}) {
  const redis = await getSharedRedis();
  const key = statusKey(jobId);
  const prevRaw = await redis.get(key);
  const prev = prevRaw ? JSON.parse(prevRaw) : {};
  const next = {
    ...prev,
    ...patch,
    jobId,
    updatedAt: new Date().toISOString(),
  };
  if (!next.createdAt) next.createdAt = next.updatedAt;
  await redis.set(key, JSON.stringify(next), "EX", ttlSec);
  await redis.publish(eventsChannel(jobId), JSON.stringify(next));
  return next;
}

async function getJobStatus(jobId) {
  const redis = await getSharedRedis();
  const raw = await redis.get(statusKey(jobId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Subscribe to job status updates (SSE). Returns unsubscribe fn.
 */
async function subscribeJobEvents(jobId, onEvent) {
  const { createRedisConnection } = require("./redisClient");
  const sub = createRedisConnection();
  await sub.connect();
  const channel = eventsChannel(jobId);
  const handler = (ch, message) => {
    if (ch !== channel) return;
    try {
      onEvent(JSON.parse(message));
    } catch (e) {
      onEvent({ jobId, type: "error", error: e?.message || String(e) });
    }
  };
  sub.on("message", handler);
  await sub.subscribe(channel);
  return async () => {
    try {
      sub.off("message", handler);
      await sub.unsubscribe(channel);
      await sub.quit();
    } catch (_) {
      try {
        sub.disconnect();
      } catch (__) {
        /* ignore */
      }
    }
  };
}

module.exports = {
  setJobStatus,
  getJobStatus,
  subscribeJobEvents,
  statusKey,
  eventsChannel,
  DEFAULT_TTL_SEC,
};
