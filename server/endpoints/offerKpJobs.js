"use strict";

const { reqBody } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { offerKpRoleGuard } = require("../utils/middleware/offerKpRoleGuard");
const { writeResponseChunk } = require("../utils/helpers/chat/responses");
const {
  isOfferKpQueueEnabled,
  assertQueueReady,
  pingRedis,
  getJobStatus,
  subscribeJobEvents,
  enqueueOcrJob,
  enqueueMatchingJob,
  enqueueExportJob,
  enqueueIndexSyncJob,
  QUEUE_NAMES,
  redisUrl,
  pipelineVersion,
} = require("../utils/offerKp/queue");

function offerKpJobEndpoints(app) {
  if (!app) return;

  app.get(
    "/offerKp/queue/status",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (_request, response) => {
      try {
        const enabled = isOfferKpQueueEnabled();
        const ping = enabled
          ? await pingRedis()
          : { ok: false, error: "queue disabled" };
        response.status(200).json({
          enabled,
          redis: ping,
          redisUrl: redisUrl().replace(/\/\/.*@/, "//***@"),
          pipelineVersion: pipelineVersion(),
          queues: Object.values(QUEUE_NAMES),
        });
      } catch (e) {
        console.error("[offerKp] queue status:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.get(
    "/offerKp/jobs/:jobId",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const ready = await assertQueueReady();
        if (!ready.ok) {
          return response.status(503).json({ error: ready.reason });
        }
        const status = await getJobStatus(request.params.jobId);
        if (!status) {
          return response.status(404).json({ error: "job not found" });
        }
        response.status(200).json(status);
      } catch (e) {
        console.error("[offerKp] job status:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  /** SSE progress stream for a job. */
  app.get(
    "/offerKp/jobs/:jobId/events",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      const jobId = request.params.jobId;
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const send = (event) => writeResponseChunk(response, event);

      let unsubscribe = null;
      try {
        const current = await getJobStatus(jobId);
        if (current) send({ type: "job_status", ...current });

        unsubscribe = await subscribeJobEvents(jobId, (status) => {
          send({ type: "job_status", ...status });
          if (status?.state === "completed" || status?.state === "failed") {
            response.end();
          }
        });

        request.on("close", async () => {
          if (unsubscribe) await unsubscribe().catch(() => {});
        });
      } catch (e) {
        send({ type: "error", error: e.message });
        response.end();
      }
    }
  );

  app.post(
    "/offerKp/jobs/ocr",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const body = reqBody(request);
        const result = await enqueueOcrJob(body);
        if (!result.ok) {
          return response.status(503).json(result);
        }
        response.status(202).json(result);
      } catch (e) {
        console.error("[offerKp] enqueue ocr:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.post(
    "/offerKp/jobs/matching",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const body = reqBody(request);
        const result = await enqueueMatchingJob(body);
        if (!result.ok) {
          return response.status(503).json(result);
        }
        response.status(202).json(result);
      } catch (e) {
        console.error("[offerKp] enqueue matching:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.post(
    "/offerKp/jobs/export",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const body = reqBody(request);
        const result = await enqueueExportJob(body);
        if (!result.ok) {
          return response.status(503).json(result);
        }
        response.status(202).json(result);
      } catch (e) {
        console.error("[offerKp] enqueue export:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.post(
    "/offerKp/jobs/index-sync",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const body = reqBody(request);
        const result = await enqueueIndexSyncJob(body);
        if (!result.ok) {
          return response.status(503).json(result);
        }
        response.status(202).json(result);
      } catch (e) {
        console.error("[offerKp] enqueue index-sync:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );
}

module.exports = { offerKpJobEndpoints };
