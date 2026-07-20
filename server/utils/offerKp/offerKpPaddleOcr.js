const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const llmDefaults = require("../../config/offerKp.llm.defaults");
const { resolveOfferKpOcrModel } = require("../../config/offerKp.models");
const { offerKpLog } = require("../offerKpApp/offerKpLog");
const { loadLmStudioModelForTask } = require("../offerKpApp/lmStudioModels");

const execFileAsync = promisify(execFile);

const OCR_PROMPT = "OCR:";

function lmStudioChatUrl() {
  const base =
    process.env.LMSTUDIO_BASE_PATH ||
    llmDefaults.LMSTUDIO_BASE_PATH ||
    "http://87.228.90.43:1234/v1";
  return `${String(base).replace(/\/$/, "")}/chat/completions`;
}

async function renderPdfPages(pdfPath, { dpi = 200, onPage = null } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "offerkp-paddle-ppm-"));
  const outRoot = path.join(tmpDir, "page");
  try {
    await execFileAsync(
      "pdftoppm",
      ["-png", "-r", String(dpi), pdfPath, outRoot],
      { timeout: 600_000 }
    );

    const pageFiles = fs
      .readdirSync(tmpDir)
      .map((file) => ({
        file,
        page: parseInt((file.match(/-(\d+)\.png$/) || [])[1] || "0", 10),
      }))
      .filter((x) => x.page > 0)
      .sort((a, b) => a.page - b.page);

    const pages = [];
    for (const { file, page } of pageFiles) {
      const buf = fs.readFileSync(path.join(tmpDir, file));
      pages.push({ pageNumber: page, buffer: buf });
      if (typeof onPage === "function") {
        onPage({ pageNumber: page, total: pageFiles.length });
      }
    }
    return pages;
  } catch (error) {
    offerKpLog("warn", "PaddleOCR pdftoppm render failed", {
      error: error?.message || String(error),
    });
    return [];
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function ocrImageBuffer(imageBuffer, modelId) {
  const base64 = imageBuffer.toString("base64");
  const apiKey = process.env.LMSTUDIO_AUTH_TOKEN || null;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(lmStudioChatUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      body?.error?.message ||
      body?.message ||
      response.statusText ||
      "OCR failed";
    throw new Error(String(detail));
  }

  return String(body?.choices?.[0]?.message?.content || "").trim();
}

/**
 * OCR PDF через PaddleOCR-VL в LM Studio (промпт OCR: + страница как image).
 * Перед вызовом загружает OCR-модель в VRAM.
 */
async function paddleOcrPdf(pdfPath, opts = {}) {
  const modelId = opts.modelId || resolveOfferKpOcrModel();
  const startedAt = Date.now();

  await loadLmStudioModelForTask("ocr", { modelId, force: true });

  const pages = await renderPdfPages(pdfPath, {
    dpi: Number(process.env.OFFER_KP_PADDLE_OCR_DPI) || 200,
    onPage: opts.onPage,
  });

  if (!pages.length) {
    throw new Error("PaddleOCR: no pages rendered from PDF");
  }

  const parts = [];
  for (const { pageNumber, buffer } of pages) {
    opts.onProgress?.({
      type: "ocr_progress",
      engine: "paddleocr-vl",
      page: pageNumber,
      total: pages.length,
    });
    const text = await ocrImageBuffer(buffer, modelId);
    parts.push(text);
    offerKpLog("info", "PaddleOCR page done", {
      page: pageNumber,
      total: pages.length,
      chars: text.length,
    });
  }

  const fullText = parts.filter(Boolean).join("\n\n");
  offerKpLog("info", "PaddleOCR PDF complete", {
    pages: pages.length,
    chars: fullText.length,
    durationMs: Date.now() - startedAt,
    model: modelId,
  });
  return fullText;
}

module.exports = {
  paddleOcrPdf,
  renderPdfPages,
  ocrImageBuffer,
  OCR_PROMPT,
};
