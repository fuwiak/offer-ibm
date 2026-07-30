"use strict";

/**
 * Process OfferKP BullMQ jobs.
 * Loaded by gpu / cpu worker entrypoints.
 */

const { setJobStatus } = require("../utils/offerKp/queue/statusStore");
const {
  getOcrCache,
  setOcrCache,
  acquireIndexSyncLock,
  releaseIndexSyncLock,
} = require("../utils/offerKp/queue/cacheStore");

async function processGpuOcrJob(job) {
  const data = job.data || {};
  const jobId = data.jobId || job.id;

  // Durable hit — skip GPU entirely (Redis → disk).
  const cached = await getOcrCache(jobId);
  if (cached?.text) {
    await setJobStatus(jobId, {
      stage: "done",
      state: "completed",
      progress: 100,
      fromCache: true,
      cacheSource: cached.source || "cache",
      result: { chars: cached.text.length, engine: cached.engine || null },
    });
    return {
      ok: true,
      chars: cached.text.length,
      engine: cached.engine,
      fromCache: true,
    };
  }

  const { visionOcrPdf } = require("../utils/offerKp/offerKpVisionOcr");

  await setJobStatus(jobId, {
    stage: "ocr",
    state: "active",
    progress: 1,
    filename: data.originalFilename || null,
  });

  const result = await visionOcrPdf(data.pdfPath, {
    contextText: data.contextText || "",
    onPage: async ({ pageNumber, total }) => {
      const progress =
        total > 0 ? Math.min(99, Math.round((pageNumber / total) * 100)) : 50;
      await setJobStatus(jobId, {
        stage: "ocr",
        state: "active",
        progress,
        page: pageNumber,
        total,
      });
      await job.updateProgress(progress);
    },
  });

  const text = typeof result === "string" ? result : result?.text || "";
  const lines =
    typeof result === "object" && result ? result.lines || null : null;
  const engine =
    (typeof result === "object" && result?.engine) || "qwen3-vl-queue";

  await setOcrCache(jobId, {
    text,
    lines,
    engine,
    pdfPath: data.pdfPath,
    fileHash: data.fileHash || null,
  });
  await setJobStatus(jobId, {
    stage: "done",
    state: "completed",
    progress: 100,
    result: { chars: text.length, engine },
  });

  return { ok: true, chars: text.length, engine, fromCache: false };
}

async function processMatchingJob(job) {
  const data = job.data || {};
  const jobId = data.jobId || job.id;
  const { matchInquiryToDraft } = require("../utils/offerKp/matchInquiryLines");

  await setJobStatus(jobId, {
    stage: "matching",
    state: "active",
    progress: 5,
  });

  const inquirySource = String(data.inquiryText || data.inquirySource || "");
  if (!inquirySource.trim()) {
    throw new Error("matching job missing inquiryText");
  }

  const draft = await matchInquiryToDraft(inquirySource, {
    threadId: data.threadId || null,
    requestId: jobId,
    onProgress: async (payload) => {
      const progress = Math.min(
        90,
        Number(payload?.progress) ||
          (payload?.done && payload?.total
            ? Math.round((payload.done / payload.total) * 90)
            : 20)
      );
      await setJobStatus(jobId, {
        stage: "matching",
        state: "active",
        progress,
        detail: payload,
      });
      await job.updateProgress(progress);
    },
  });

  await setJobStatus(jobId, {
    stage: "price_check",
    state: "active",
    progress: 95,
  });

  // Live price truth stays in ShopDB; matching already applied gates.
  await setJobStatus(jobId, {
    stage: "done",
    state: "completed",
    progress: 100,
    result: {
      lineCount: draft?.lines?.length || 0,
      subtotal: draft?.subtotal ?? null,
    },
  });

  // Do not put full draft into Redis status — return to caller via job returnvalue.
  return {
    ok: true,
    draft,
  };
}

async function processExportJob(job) {
  const data = job.data || {};
  const jobId = data.jobId || job.id;
  const format = String(data.format || "docx").toLowerCase();
  const quoteData = data.quoteData || data.quote || null;
  if (!quoteData) throw new Error("export job missing quoteData");

  await setJobStatus(jobId, {
    stage: "export",
    state: "active",
    progress: 10,
    format,
  });

  // Re-read prices from ShopDB right before export (authoritative).
  try {
    const {
      refreshDraftPricesFromShopDb,
    } = require("../utils/offerKp/refreshDraftPrices");
    const { fetchProductStocks } = require("../utils/offerKp/matchInquiryLines");
    if (
      typeof refreshDraftPricesFromShopDb === "function" &&
      Array.isArray(quoteData.lines)
    ) {
      await refreshDraftPricesFromShopDb(quoteData, fetchProductStocks);
    }
  } catch (_) {
    /* best-effort — export still proceeds with draft prices */
  }

  let result;
  if (format === "pdf") {
    const { generateQuotePdf } = require("../utils/offerKpApp/generateQuotePdf");
    result = await generateQuotePdf(quoteData);
  } else if (format === "xlsx") {
    const { generateQuoteXlsx } = require("../utils/offerKpApp/generateQuoteXlsx");
    result = await generateQuoteXlsx(quoteData);
  } else {
    const { generateQuoteDocx } = require("../utils/offerKpApp/generateQuoteDocx");
    result = await generateQuoteDocx(quoteData);
  }

  await setJobStatus(jobId, {
    stage: "done",
    state: "completed",
    progress: 100,
    format,
    result: {
      filename: result?.filename || null,
      path: result?.path || result?.filepath || null,
    },
  });

  return { ok: true, format, result };
}

async function processIndexSyncJob(job) {
  const data = job.data || {};
  const jobId = data.jobId || job.id;
  const token = await acquireIndexSyncLock(
    Number(process.env.OFFER_KP_INDEX_SYNC_LOCK_TTL || 1800)
  );
  if (!token) {
    await setJobStatus(jobId, {
      stage: "failed",
      state: "failed",
      progress: 0,
      error: "index sync lock held",
    });
    throw new Error("index sync lock held");
  }

  try {
    await setJobStatus(jobId, {
      stage: "matching",
      state: "active",
      progress: 5,
    });
    const {
      syncCanonicalCatalogIndex,
    } = require("../utils/offerKp/canonicalCatalogIndex");
    const result = await syncCanonicalCatalogIndex({
      force: data.force !== false,
    });
    await setJobStatus(jobId, {
      stage: "done",
      state: "completed",
      progress: 100,
      result: {
        skipped: !!result?.skipped,
        productCount: result?.manifest?.productCount || 0,
      },
    });
    return { ok: true, result };
  } finally {
    await releaseIndexSyncLock(token);
  }
}

module.exports = {
  processGpuOcrJob,
  processMatchingJob,
  processExportJob,
  processIndexSyncJob,
};
