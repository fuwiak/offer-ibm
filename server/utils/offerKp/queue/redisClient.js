"use strict";

const Redis = require("ioredis");
const { redisUrl } = require("./constants");

/** @type {import("ioredis").Redis | null} */
let shared = null;
let lastError = null;

function createRedisConnection(overrides = {}) {
  const url = redisUrl();
  const conn = new Redis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: true,
    lazyConnect: true,
    ...overrides,
  });
  conn.on("error", (err) => {
    lastError = err?.message || String(err);
  });
  return conn;
}

async function getSharedRedis() {
  if (shared && shared.status === "ready") return shared;
  if (!shared) {
    shared = createRedisConnection();
  }
  if (shared.status !== "ready" && shared.status !== "connecting") {
    await shared.connect();
  } else if (shared.status === "connecting") {
    await new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onErr = (e) => {
        cleanup();
        reject(e);
      };
      const cleanup = () => {
        shared.off("ready", onReady);
        shared.off("error", onErr);
      };
      shared.once("ready", onReady);
      shared.once("error", onErr);
    });
  }
  return shared;
}

async function pingRedis(timeoutMs = 1500) {
  try {
    const client = createRedisConnection({ lazyConnect: true });
    const timer = setTimeout(() => {
      try {
        client.disconnect();
      } catch (_) {
        /* ignore */
      }
    }, timeoutMs);
    await client.connect();
    const pong = await Promise.race([
      client.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("redis ping timeout")), timeoutMs)
      ),
    ]);
    clearTimeout(timer);
    await client.quit().catch(() => client.disconnect());
    return { ok: pong === "PONG", error: null };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) || lastError };
  }
}

async function closeSharedRedis() {
  if (!shared) return;
  const c = shared;
  shared = null;
  try {
    await c.quit();
  } catch (_) {
    try {
      c.disconnect();
    } catch (__) {
      /* ignore */
    }
  }
}

function bullmqConnectionOpts() {
  const url = new URL(redisUrl());
  return {
    host: url.hostname || "127.0.0.1",
    port: Number(url.port || 6379),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    db: Number((url.pathname || "/0").replace(/^\//, "") || 0),
    maxRetriesPerRequest: null,
  };
}

module.exports = {
  createRedisConnection,
  getSharedRedis,
  pingRedis,
  closeSharedRedis,
  bullmqConnectionOpts,
};
