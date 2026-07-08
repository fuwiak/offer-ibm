const llmDefaults = require("../../config/offerKp.llm.defaults");
const { resolveOfferKpChatModel } = require("../../config/offerKp.models");
const { offerKpLog } = require("../offerKpApp/offerKpLog");
const { renderPdfPages } = require("./offerKpPaddleOcr");

const VISION_OCR_PROMPT = `Извлеки весь текст с изображения заявки/спецификации.
Сохрани таблицу построчно: № | Наименование | Ед.изм. | Кол-во.
Кол-во — целые числа или кг из колонки «Кол-во». НЕ путай кол-во с ценой (руб/копейки).
Только извлечённый текст на русском, без комментариев.`;

function lmStudioChatUrl() {
  const base =
    process.env.LMSTUDIO_BASE_PATH ||
    llmDefaults.LMSTUDIO_BASE_PATH ||
    "http://87.228.90.43:1234/v1";
  return `${String(base).replace(/\/$/, "")}/chat/completions`;
}

async function visionOcrImageBuffer(imageBuffer, modelId) {
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
            { type: "text", text: VISION_OCR_PROMPT },
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
      max_tokens: 8192,
    }),
    signal: AbortSignal.timeout(240_000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      body?.error?.message || body?.message || response.statusText || "Vision OCR failed";
    throw new Error(String(detail));
  }

  return String(body?.choices?.[0]?.message?.content || "").trim();
}

/**
 * Чтение PDF через Qwen3-VL (та же модель, что и для КП) — без смены VRAM.
 */
async function visionOcrPdf(pdfPath, opts = {}) {
  const modelId =
    opts.modelId ||
    resolveOfferKpChatModel(opts.workspace) ||
    llmDefaults.LMSTUDIO_MODEL_PREF;
  const startedAt = Date.now();

  const pages = await renderPdfPages(pdfPath, {
    dpi: Number(process.env.OFFER_KP_VISION_OCR_DPI) || 200,
    onPage: opts.onPage,
  });

  if (!pages.length) {
    throw new Error("Vision OCR: no pages rendered from PDF");
  }

  const parts = [];
  for (const { pageNumber, buffer } of pages) {
    opts.onProgress?.({
      type: "ocr_progress",
      engine: "qwen3-vl",
      page: pageNumber,
      total: pages.length,
    });
    const text = await visionOcrImageBuffer(buffer, modelId);
    parts.push(text);
    offerKpLog("info", "Vision OCR page done", {
      page: pageNumber,
      total: pages.length,
      chars: text.length,
      model: modelId,
    });
  }

  const fullText = parts.filter(Boolean).join("\n\n");
  offerKpLog("info", "Vision OCR PDF complete", {
    pages: pages.length,
    chars: fullText.length,
    durationMs: Date.now() - startedAt,
    model: modelId,
  });
  return fullText;
}

module.exports = {
  visionOcrPdf,
  visionOcrImageBuffer,
  VISION_OCR_PROMPT,
};
